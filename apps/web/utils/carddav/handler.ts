import prisma from "@/utils/prisma";
import { contactEtag, generateVCard, parseVCard } from "@/utils/carddav/vcard";
import type { ContactPhone } from "@/utils/contacts";

// A deliberately small CardDAV server: one addressbook per email account,
// serving the account's saved contacts. Implements the subset iOS/macOS
// Contacts needs — principal discovery, addressbook PROPFIND with ctag,
// addressbook-multiget/query REPORTs, and GET/PUT/DELETE per contact.

const BASE = "/api/carddav";
const ADDRESSBOOK_PATH = `${BASE}/addressbook`;

type DavResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

export async function handleCarddavRequest({
  method,
  segments,
  depth,
  body,
  emailAccountId,
  // The exact request path, echoed back as the response href — Apple's
  // client matches responses to the resource it asked about by href, so
  // answering /api/carddav with an href of /api/carddav/ reads as an answer
  // about a different resource
  requestPath,
}: {
  method: string;
  segments: string[];
  depth: string;
  body: string;
  emailAccountId: string;
  requestPath?: string;
}): Promise<DavResponse> {
  const [root, resource] = segments;

  if (method === "OPTIONS") {
    return {
      status: 200,
      headers: {
        DAV: "1, 3, addressbook",
        Allow: "OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT",
      },
    };
  }

  // /api/carddav or /api/carddav/principal → discovery. The root doubles as
  // the addressbook home set: Apple's client lists the home set's CHILDREN
  // (Depth 1) looking for addressbook collections — a home set that is
  // itself the addressbook enumerates as empty and syncs nothing.
  if (method === "PROPFIND" && (!root || root === "principal")) {
    const discovery = discoveryResponse({
      level: root ? "principal" : "root",
      requestBody: body,
      href: requestPath || (root ? `${BASE}/principal` : BASE),
    });
    const children =
      !root && depth !== "0"
        ? [await addressbookCollectionResponse(emailAccountId)]
        : [];
    return multistatus([discovery, ...children].join("\n"));
  }

  if (root === "addressbook") {
    if (method === "PROPFIND" && !resource) {
      return propfindAddressbook({ emailAccountId, depth });
    }
    if (method === "REPORT" && !resource) {
      return reportAddressbook({ emailAccountId, body });
    }
    if (resource?.endsWith(".vcf")) {
      const uid = decodeURIComponent(resource.slice(0, -4));
      if (method === "GET") return getContact({ emailAccountId, uid });
      if (method === "PUT") return putContact({ emailAccountId, uid, body });
      if (method === "DELETE") return deleteContact({ emailAccountId, uid });
    }
  }

  return { status: 404, body: "Not found" };
}

// Every property the discovery levels can answer. principal-URL and
// current-user-principal are equivalent here — one account, one principal.
const DISCOVERY_PROPS: Record<"root" | "principal", Record<string, string>> = {
  root: {
    "current-user-principal": `<d:current-user-principal><d:href>${BASE}/principal</d:href></d:current-user-principal>`,
    "principal-URL": `<d:principal-URL><d:href>${BASE}/principal</d:href></d:principal-URL>`,
    resourcetype: "<d:resourcetype><d:collection/></d:resourcetype>",
    displayname: "<d:displayname>Zerrow</d:displayname>",
  },
  principal: {
    "current-user-principal": `<d:current-user-principal><d:href>${BASE}/principal</d:href></d:current-user-principal>`,
    "principal-URL": `<d:principal-URL><d:href>${BASE}/principal</d:href></d:principal-URL>`,
    resourcetype: "<d:resourcetype><d:principal/></d:resourcetype>",
    displayname: "<d:displayname>Zerrow</d:displayname>",
    "addressbook-home-set": `<card:addressbook-home-set xmlns:card="urn:ietf:params:xml:ns:carddav"><d:href>${BASE}/</d:href></card:addressbook-home-set>`,
  },
};

function discoveryResponse({
  level,
  requestBody,
  href,
}: {
  level: "root" | "principal";
  requestBody: string;
  href: string;
}): string {
  const available = DISCOVERY_PROPS[level];
  // RFC 4918: answer each requested property, with a 404 propstat for the
  // ones this resource doesn't have — silently omitting a requested prop
  // leaves a strict client unable to tell an incomplete answer from a
  // missing property. An empty body means allprop: everything we have.
  const requested = requestedProps(requestBody);
  const names = requested.length ? requested : Object.keys(available);

  const found = names.filter((name) => available[name]);
  const missing = requested.filter((name) => !available[name]);

  const propstats = [
    found.length
      ? `<d:propstat><d:prop>${found
          .map((name) => available[name])
          .join(
            "\n",
          )}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>`
      : "",
    missing.length
      ? `<d:propstat><d:prop>${missing
          .map((name) => `<d:${escapeXml(name)}/>`)
          .join(
            "",
          )}</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>`
      : "",
  ]
    .filter(Boolean)
    .join("\n  ");

  return `<d:response>
  <d:href>${escapeXml(href)}</d:href>
  ${propstats}
</d:response>`;
}

// The local names of the properties a PROPFIND body asks for, in document
// order. Tag prefixes vary by client (d:, D:, A:, none), so they're ignored.
function requestedProps(body: string): string[] {
  const propBlock = body.match(
    /<(?:\w+:)?prop[\s>]([\s\S]*?)<\/(?:\w+:)?prop>/i,
  );
  if (!propBlock) return [];
  return [...propBlock[1].matchAll(/<(?:\w+:)?([\w-]+)[\s/>]/g)]
    .map((match) => match[1])
    .filter((name) => name.toLowerCase() !== "prop");
}

// The addressbook collection's own PROPFIND response: what the home-set
// listing and the addressbook's own PROPFIND both return for it
async function addressbookCollectionResponse(
  emailAccountId: string,
): Promise<string> {
  const contacts = await prisma.contact.findMany({
    where: { emailAccountId },
    select: { updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });
  const count = await prisma.contact.count({ where: { emailAccountId } });
  const ctag = `${contacts[0]?.updatedAt.getTime() ?? 0}-${count}`;

  return `<d:response>
  <d:href>${ADDRESSBOOK_PATH}/</d:href>
  <d:propstat><d:prop>
    <d:resourcetype><d:collection/><card:addressbook xmlns:card="urn:ietf:params:xml:ns:carddav"/></d:resourcetype>
    <d:displayname>Zerrow Contacts</d:displayname>
    <cs:getctag xmlns:cs="http://calendarserver.org/ns/">${ctag}</cs:getctag>
    <d:supported-report-set>
      <d:supported-report><d:report><card:addressbook-multiget xmlns:card="urn:ietf:params:xml:ns:carddav"/></d:report></d:supported-report>
      <d:supported-report><d:report><card:addressbook-query xmlns:card="urn:ietf:params:xml:ns:carddav"/></d:report></d:supported-report>
    </d:supported-report-set>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`;
}

async function propfindAddressbook({
  emailAccountId,
  depth,
}: {
  emailAccountId: string;
  depth: string;
}): Promise<DavResponse> {
  const collection = await addressbookCollectionResponse(emailAccountId);

  const contacts = await prisma.contact.findMany({
    where: { emailAccountId },
    select: { id: true, carddavUid: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const children =
    depth === "0"
      ? ""
      : contacts
          .map(
            (contact) => `<d:response>
  <d:href>${contactHref(contact)}</d:href>
  <d:propstat><d:prop>
    <d:resourcetype/>
    <d:getetag>${escapeXml(contactEtag(contact.updatedAt))}</d:getetag>
    <d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`,
          )
          .join("\n");

  return multistatus(`${collection}\n${children}`);
}

async function reportAddressbook({
  emailAccountId,
  body,
}: {
  emailAccountId: string;
  body: string;
}): Promise<DavResponse> {
  const isMultiget = /addressbook-multiget/i.test(body);

  const contacts = await loadFullContacts(emailAccountId);

  const requested = isMultiget
    ? new Set(
        [...body.matchAll(/<[^>]*href[^>]*>([^<]+)<\//gi)].map((match) =>
          decodeURIComponent(match[1].trim()),
        ),
      )
    : null;

  const responses = contacts
    .filter((contact) => !requested || requested.has(contactHref(contact)))
    .map(
      (contact) => `<d:response>
  <d:href>${contactHref(contact)}</d:href>
  <d:propstat><d:prop>
    <d:getetag>${escapeXml(contactEtag(contact.updatedAt))}</d:getetag>
    <card:address-data xmlns:card="urn:ietf:params:xml:ns:carddav">${escapeXml(contactVCard(contact))}</card:address-data>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`,
    )
    .join("\n");

  return multistatus(responses);
}

async function getContact({
  emailAccountId,
  uid,
}: {
  emailAccountId: string;
  uid: string;
}): Promise<DavResponse> {
  const contact = await findByUid(emailAccountId, uid);
  if (!contact) return { status: 404, body: "Not found" };

  return {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      ETag: contactEtag(contact.updatedAt),
    },
    body: contactVCard(contact),
  };
}

// Two-way: iOS edits and new contacts land here
async function putContact({
  emailAccountId,
  uid,
  body,
}: {
  emailAccountId: string;
  uid: string;
  body: string;
}): Promise<DavResponse> {
  const parsed = parseVCard(body);
  // A phone-only card is a real contact on iOS, so the UID carries identity
  // when there's no address. Something has to identify the person though.
  if (!parsed.email && !parsed.name && !parsed.phones.length) {
    return { status: 422, body: "A contact needs a name, email, or phone" };
  }

  const details = {
    name: parsed.name,
    phones: parsed.phones,
    title: parsed.title,
    carddavUid: parsed.uid ?? uid,
  };

  const existing =
    (await findByUid(emailAccountId, uid)) ??
    (parsed.email
      ? await prisma.contact.findUnique({
          where: {
            emailAccountId_email: { emailAccountId, email: parsed.email },
          },
          select: { id: true },
        })
      : null);

  const saved = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: details,
      })
    : await prisma.contact.create({
        data: { emailAccountId, email: parsed.email, ...details },
      });

  return {
    status: existing ? 204 : 201,
    headers: { ETag: contactEtag(saved.updatedAt) },
  };
}

async function deleteContact({
  emailAccountId,
  uid,
}: {
  emailAccountId: string;
  uid: string;
}): Promise<DavResponse> {
  const contact = await findByUid(emailAccountId, uid);
  if (!contact) return { status: 404, body: "Not found" };

  await prisma.contact.delete({ where: { id: contact.id } });
  return { status: 204 };
}

type FullContact = Awaited<ReturnType<typeof loadFullContacts>>[number];

async function loadFullContacts(emailAccountId: string) {
  return prisma.contact.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      carddavUid: true,
      email: true,
      name: true,
      phones: true,
      title: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
  });
}

async function findByUid(emailAccountId: string, uid: string) {
  return prisma.contact.findFirst({
    where: { emailAccountId, OR: [{ carddavUid: uid }, { id: uid }] },
    select: {
      id: true,
      carddavUid: true,
      email: true,
      name: true,
      phones: true,
      title: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
  });
}

function contactHref(contact: { id: string; carddavUid: string | null }) {
  return `${ADDRESSBOOK_PATH}/${encodeURIComponent(contact.carddavUid ?? contact.id)}.vcf`;
}

function contactVCard(contact: FullContact): string {
  return generateVCard({
    uid: contact.carddavUid ?? contact.id,
    email: contact.email,
    name: contact.name,
    phones: (contact.phones ?? []) as ContactPhone[],
    title: contact.title,
    companyName: contact.company?.name ?? null,
    updatedAt: contact.updatedAt,
  });
}

function multistatus(responses: string): DavResponse {
  return {
    status: 207,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Some clients check DAV compliance on every response, not just the
      // OPTIONS probe
      DAV: "1, 3, addressbook",
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
${responses}
</d:multistatus>`,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
