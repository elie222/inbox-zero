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
}: {
  method: string;
  segments: string[];
  depth: string;
  body: string;
  emailAccountId: string;
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

  // /api/carddav or /api/carddav/principal → discovery
  if (method === "PROPFIND" && (!root || root === "principal")) {
    return propfindDiscovery(root ? "principal" : "root");
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

function propfindDiscovery(level: "root" | "principal"): DavResponse {
  const props =
    level === "root"
      ? `<d:current-user-principal><d:href>${BASE}/principal</d:href></d:current-user-principal>
<d:resourcetype><d:collection/></d:resourcetype>`
      : `<d:resourcetype><d:principal/></d:resourcetype>
<card:addressbook-home-set xmlns:card="urn:ietf:params:xml:ns:carddav"><d:href>${BASE}/addressbook/</d:href></card:addressbook-home-set>
<d:displayname>Zerrow</d:displayname>`;

  const href = level === "root" ? `${BASE}/` : `${BASE}/principal`;

  return multistatus(`<d:response>
  <d:href>${href}</d:href>
  <d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`);
}

async function propfindAddressbook({
  emailAccountId,
  depth,
}: {
  emailAccountId: string;
  depth: string;
}): Promise<DavResponse> {
  const contacts = await prisma.contact.findMany({
    where: { emailAccountId },
    select: { id: true, carddavUid: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const ctag = `${contacts[0]?.updatedAt.getTime() ?? 0}-${contacts.length}`;

  const collection = `<d:response>
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
  if (!parsed.email) {
    return { status: 422, body: "A contact needs an email address" };
  }

  const details = {
    name: parsed.name,
    phones: parsed.phones,
    title: parsed.title,
    carddavUid: parsed.uid ?? uid,
  };

  const existing =
    (await findByUid(emailAccountId, uid)) ??
    (await prisma.contact.findUnique({
      where: { emailAccountId_email: { emailAccountId, email: parsed.email } },
      select: { id: true },
    }));

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
    headers: { "Content-Type": "application/xml; charset=utf-8" },
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
