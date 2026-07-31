import prisma from "@/utils/prisma";
import {
  contactEtag,
  generateGroupVCard,
  generateVCard,
  groupEtag,
  parseVCard,
} from "@/utils/carddav/vcard";
import type { ContactPhone } from "@/utils/contacts";

// A deliberately small CardDAV server: one addressbook per email account,
// serving the account's saved contacts. Implements the subset iOS/macOS
// Contacts needs — principal discovery, addressbook PROPFIND with ctag,
// addressbook-multiget/query REPORTs, and GET/PUT/DELETE per contact.
// Zerrow's company labels are published alongside as Apple group vCards
// (group-<labelId>.vcf) so they appear as folders in iOS Contacts.

const BASE = "/api/carddav";
const ADDRESSBOOK_PATH = `${BASE}/addressbook`;

// Prefixed onto the ctag and sync token. Bump when a sync bug shipped and
// clients may hold a "current" ctag for state they never actually downloaded
// (see addressbookState).
const CTAG_GENERATION = 3;

// RFC 6578 sync tokens must be URIs; the suffix carries the same change
// material as the ctag so any edit, add, or delete invalidates both.
const SYNC_TOKEN_PREFIX = "urn:zerrow:carddav:";

type DavResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  // Folded into the proxy's per-exchange log line — how many cards a REPORT
  // matched, whether a sync was truncated — so a client stuck mid-download
  // can be diagnosed from logs alone
  meta?: Record<string, unknown>;
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
        ? [await addressbookCollectionResponse(emailAccountId, body)]
        : [];
    return multistatus([discovery, ...children].join("\n"));
  }

  if (root === "addressbook") {
    if (method === "PROPFIND" && !resource) {
      return propfindAddressbook({ emailAccountId, depth, body });
    }
    if (method === "REPORT" && !resource) {
      return reportAddressbook({ emailAccountId, body });
    }
    if (resource?.endsWith(".vcf")) {
      const groupMatch = resource.match(/^group-(.+)\.vcf$/i);
      if (groupMatch) {
        return handleGroupResource({
          emailAccountId,
          method,
          labelId: safeDecode(groupMatch[1]),
          requestBody: body,
        });
      }
      const uid = safeDecode(resource.slice(0, -4));
      if (method === "GET") return getContact({ emailAccountId, uid });
      if (method === "PUT") return putContact({ emailAccountId, uid, body });
      if (method === "DELETE") return deleteContact({ emailAccountId, uid });
      if (method === "PROPFIND") {
        return propfindContact({ emailAccountId, uid, requestBody: body });
      }
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
    // Both collection and principal: the setup URL the user types IS this
    // root, and iOS treats a typed URL as the principal itself — it asks it
    // for addressbook-home-set directly and abandons setup on a 404 propstat
    // instead of following current-user-principal (observed live: two root
    // PROPFINDs, the second all-404, then silence).
    resourcetype:
      "<d:resourcetype><d:collection/><d:principal/></d:resourcetype>",
    displayname: "<d:displayname>Zerrow</d:displayname>",
    "addressbook-home-set": `<card:addressbook-home-set xmlns:card="urn:ietf:params:xml:ns:carddav"><d:href>${BASE}/</d:href></card:addressbook-home-set>`,
  },
  principal: {
    "current-user-principal": `<d:current-user-principal><d:href>${BASE}/principal</d:href></d:current-user-principal>`,
    "principal-URL": `<d:principal-URL><d:href>${BASE}/principal</d:href></d:principal-URL>`,
    resourcetype: "<d:resourcetype><d:principal/></d:resourcetype>",
    displayname: "<d:displayname>Zerrow</d:displayname>",
    // Collections end in "/" — Apple's client canonicalizes DAV collection
    // URLs that way. proxy.ts serves both slash forms directly (Next's
    // trailing-slash redirect is off), so this never redirects.
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
  return `<d:response>
  <d:href>${escapeXml(href)}</d:href>
  ${propstats(DISCOVERY_PROPS[level], requestBody)}
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

// The addressbook's current change state, shared by the ctag and the sync
// token so the legacy poll path and the sync-collection path can never
// disagree about whether something changed. Bumping CTAG_GENERATION
// invalidates every client's stored copy of both, forcing a full re-download
// — the escape hatch for clients that recorded a ctag during a broken sync
// and now believe they're up to date with zero cards.
async function addressbookState(emailAccountId: string) {
  // Labels and companies participate because the group vCards ride on them:
  // renaming a label or pointing a company at a different label touches
  // neither contact row, yet it changes what the phone should display — the
  // ctag and sync token must move with it.
  const where = { emailAccountId };
  const newestFirst = {
    where,
    select: { updatedAt: true } as const,
    orderBy: { updatedAt: "desc" } as const,
    take: 1,
  };
  const [
    latestContact,
    contactCount,
    latestLabel,
    labelCount,
    latestCompany,
    companyCount,
  ] = await Promise.all([
    prisma.contact.findMany(newestFirst),
    prisma.contact.count({ where }),
    prisma.companyLabel.findMany(newestFirst),
    prisma.companyLabel.count({ where }),
    prisma.company.findMany(newestFirst),
    prisma.company.count({ where }),
  ]);
  const version = [
    CTAG_GENERATION,
    latestContact[0]?.updatedAt.getTime() ?? 0,
    contactCount,
    latestLabel[0]?.updatedAt.getTime() ?? 0,
    labelCount,
    latestCompany[0]?.updatedAt.getTime() ?? 0,
    companyCount,
  ].join("-");
  return {
    ctag: `"${version}"`,
    syncToken: `${SYNC_TOKEN_PREFIX}${version}`,
  };
}

// The addressbook collection's own PROPFIND response: what the home-set
// listing and the addressbook's own PROPFIND both return for it
async function addressbookCollectionResponse(
  emailAccountId: string,
  requestBody = "",
): Promise<string> {
  const { ctag, syncToken } = await addressbookState(emailAccountId);

  const available: Record<string, string> = {
    resourcetype:
      '<d:resourcetype><d:collection/><card:addressbook xmlns:card="urn:ietf:params:xml:ns:carddav"/></d:resourcetype>',
    displayname: "<d:displayname>Zerrow Contacts</d:displayname>",
    "addressbook-description":
      '<card:addressbook-description xmlns:card="urn:ietf:params:xml:ns:carddav">Contacts synced from Zerrow</card:addressbook-description>',
    getctag: `<cs:getctag xmlns:cs="http://calendarserver.org/ns/">${escapeXml(ctag)}</cs:getctag>`,
    "sync-token": `<d:sync-token>${escapeXml(syncToken)}</d:sync-token>`,
    "supported-report-set": `<d:supported-report-set>
      <d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>
      <d:supported-report><d:report><card:addressbook-multiget xmlns:card="urn:ietf:params:xml:ns:carddav"/></d:report></d:supported-report>
      <d:supported-report><d:report><card:addressbook-query xmlns:card="urn:ietf:params:xml:ns:carddav"/></d:report></d:supported-report>
    </d:supported-report-set>`,
    "supported-address-data": `<card:supported-address-data xmlns:card="urn:ietf:params:xml:ns:carddav">
      <card:address-data-type content-type="text/vcard" version="3.0"/>
    </card:supported-address-data>`,
    // Apple's client reads writability off the privilege set — without it
    // the account can mount read-only
    "current-user-privilege-set":
      "<d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>",
    owner: `<d:owner><d:href>${BASE}/principal</d:href></d:owner>`,
    "current-user-principal": DISCOVERY_PROPS.root["current-user-principal"],
    "principal-URL": DISCOVERY_PROPS.root["principal-URL"],
  };

  return `<d:response>
  <d:href>${ADDRESSBOOK_PATH}/</d:href>
  ${propstats(available, requestBody)}
</d:response>`;
}

async function propfindAddressbook({
  emailAccountId,
  depth,
  body,
}: {
  emailAccountId: string;
  depth: string;
  body: string;
}): Promise<DavResponse> {
  const collection = await addressbookCollectionResponse(emailAccountId, body);
  if (depth === "0") return multistatus(collection);

  const [contacts, groups] = await Promise.all([
    prisma.contact.findMany({
      where: { emailAccountId },
      select: { id: true, carddavUid: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    loadGroups(emailAccountId),
  ]);

  const children = [
    ...contacts.map(
      (contact) => `<d:response>
  <d:href>${contactHref(contact)}</d:href>
  ${propstats(resourceProps(contactEtag(contact.updatedAt)), body)}
</d:response>`,
    ),
    ...groups.map(
      (group) => `<d:response>
  <d:href>${groupHref(group.id)}</d:href>
  ${propstats(resourceProps(group.etag), body)}
</d:response>`,
    ),
  ].join("\n");

  return multistatus(`${collection}\n${children}`);
}

async function reportAddressbook({
  emailAccountId,
  body,
}: {
  emailAccountId: string;
  body: string;
}): Promise<DavResponse> {
  if (/sync-collection/i.test(body)) {
    return syncCollectionReport({ emailAccountId, body });
  }

  const isMultiget = /addressbook-multiget/i.test(body);
  if (!isMultiget && !/addressbook-query/i.test(body)) {
    // An unrecognized REPORT answered with a full dump reads as garbage to
    // the client that sent it — it asked a question we didn't understand,
    // so the honest answer is "no results", not "here's everything".
    return multistatus("");
  }

  const [contacts, groups] = await Promise.all([
    loadFullContacts(emailAccountId),
    loadGroups(emailAccountId),
  ]);

  const requestedHrefs = isMultiget
    ? [...body.matchAll(/<[^>]*href[^>]*>([^<]+)<\//gi)].map((match) =>
        safeDecode(match[1].trim()),
      )
    : null;
  const requested = requestedHrefs ? new Set(requestedHrefs) : null;

  const wanted = (href: string) =>
    // Clients echo hrefs in whichever encoding they parsed, so match
    // the percent-encoded and decoded forms both
    !requested ||
    requested.has(href) ||
    requested.has(decodeURIComponent(href));

  const matched = contacts.filter((contact) => wanted(contactHref(contact)));
  const matchedGroups = groups.filter((group) => wanted(groupHref(group.id)));

  const responses = [
    ...matched.map(
      (contact) => `<d:response>
  <d:href>${contactHref(contact)}</d:href>
  <d:propstat><d:prop>
    <d:getetag>${escapeXml(contactEtag(contact.updatedAt))}</d:getetag>
    <card:address-data xmlns:card="urn:ietf:params:xml:ns:carddav">${escapeXml(contactVCard(contact))}</card:address-data>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`,
    ),
    ...matchedGroups.map((group) => groupReportResponse(group, true)),
  ].join("\n");

  // RFC 6352 §8.7: every requested href gets an answer — a card the client
  // asked about that no longer exists is a 404 response, not an omission a
  // strict client can mistake for a broken batch
  const matchedHrefs = new Set(
    [
      ...matched.map(contactHref),
      ...matchedGroups.map((group) => groupHref(group.id)),
    ].flatMap((href) => [href, decodeURIComponent(href)]),
  );
  const missing = (requestedHrefs ?? [])
    .filter((href) => !matchedHrefs.has(href))
    .map(
      (href) => `<d:response>
  <d:href>${escapeXml(href)}</d:href>
  <d:status>HTTP/1.1 404 Not Found</d:status>
</d:response>`,
    )
    .join("\n");

  const result = multistatus([responses, missing].filter(Boolean).join("\n"));
  const matchedCount = matched.length + matchedGroups.length;
  result.meta = {
    report: isMultiget ? "multiget" : "query",
    requestedHrefs: requestedHrefs?.length ?? null,
    matched: matchedCount,
    groups: matchedGroups.length,
    notFound: requestedHrefs ? requestedHrefs.length - matchedCount : 0,
  };
  return result;
}

// RFC 6578 change tracking, the sync path modern iOS prefers. The token
// encodes the whole book's state, so there are only three answers: initial
// sync (no token) gets everything plus the current token, a current token
// gets "no changes", and any other token gets the valid-sync-token error —
// the RFC's way of saying "resync from scratch". No tombstones needed:
// deletes change the state, invalidate the token, and arrive via the resync.
async function syncCollectionReport({
  emailAccountId,
  body,
}: {
  emailAccountId: string;
  body: string;
}): Promise<DavResponse> {
  const { syncToken } = await addressbookState(emailAccountId);
  const clientToken =
    body
      .match(
        /<(?:\w+:)?sync-token[^>]*>([\s\S]*?)<\/(?:\w+:)?sync-token>/i,
      )?.[1]
      ?.trim() ?? "";

  if (clientToken && clientToken === syncToken) {
    const tokenLine = `<d:sync-token>${escapeXml(syncToken)}</d:sync-token>`;
    const result = multistatus(tokenLine);
    result.meta = { report: "sync", changes: 0 };
    return result;
  }
  if (clientToken) {
    return {
      status: 403,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: `<?xml version="1.0" encoding="utf-8"?>
<d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>`,
      meta: { report: "sync", staleToken: true },
    };
  }

  // Initial sync: everything, capped at the client's limit when one is sent
  // — exactly what the proven reference server does. Deliberately NO RFC
  // 6578 truncation/paging: Apple's client has never been observed handling
  // a 507 continuation here, and the reference syncs the same phone in full
  // without one.
  const limit = Number(body.match(/<(?:\w+:)?nresults[^>]*>(\d+)</i)?.[1] ?? 0);
  const includeAddressData = /address-data/i.test(body);
  const [contacts, groups] = await Promise.all([
    loadFullContacts(emailAccountId),
    loadGroups(emailAccountId),
  ]);
  const served = limit ? contacts.slice(0, limit) : contacts;

  // Groups ride along uncapped (like the reference server): there are only
  // ever a handful, and a group the phone hears about before its members is
  // harmless — membership resolves as the member cards arrive
  const responses = [
    ...served.map(
      (contact) => `<d:response>
  <d:href>${contactHref(contact)}</d:href>
  <d:propstat><d:prop>
    <d:getetag>${escapeXml(contactEtag(contact.updatedAt))}</d:getetag>${
      includeAddressData
        ? `
    <card:address-data xmlns:card="urn:ietf:params:xml:ns:carddav">${escapeXml(contactVCard(contact))}</card:address-data>`
        : ""
    }
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`,
    ),
    ...groups.map((group) => groupReportResponse(group, includeAddressData)),
  ].join("\n");

  const tokenLine = `<d:sync-token>${escapeXml(syncToken)}</d:sync-token>`;
  const result = multistatus([responses, tokenLine].filter(Boolean).join("\n"));
  result.meta = {
    report: "sync",
    total: contacts.length,
    returned: served.length,
    groups: groups.length,
    limit: limit || null,
    includeAddressData,
  };
  return result;
}

// iOS spot-checks single cards with PROPFIND (etag freshness); answering 404
// tells it the card is gone
async function propfindContact({
  emailAccountId,
  uid,
  requestBody,
}: {
  emailAccountId: string;
  uid: string;
  requestBody: string;
}): Promise<DavResponse> {
  const contact = await findByUid(emailAccountId, uid);
  if (!contact) return { status: 404, body: "Not found" };

  return multistatus(`<d:response>
  <d:href>${contactHref(contact)}</d:href>
  ${propstats(resourceProps(contactEtag(contact.updatedAt)), requestBody)}
</d:response>`);
}

// GET/PROPFIND/PUT/DELETE on a group-<labelId>.vcf resource. Groups mirror
// Zerrow's company labels, which attach to companies rather than contacts —
// a phone-side group edit has no clean mapping, so writes are refused and
// the phone keeps its copy read-only.
async function handleGroupResource({
  emailAccountId,
  method,
  labelId,
  requestBody,
}: {
  emailAccountId: string;
  method: string;
  labelId: string;
  requestBody: string;
}): Promise<DavResponse> {
  if (method === "PUT" || method === "DELETE") return groupsAreReadOnly();

  const group = (await loadGroups(emailAccountId)).find(
    (candidate) => candidate.id === labelId,
  );
  if (!group) return { status: 404, body: "Not found" };

  if (method === "GET") {
    return {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        ETag: group.etag,
      },
      body: groupVCard(group),
    };
  }
  if (method === "PROPFIND") {
    return multistatus(`<d:response>
  <d:href>${groupHref(group.id)}</d:href>
  ${propstats(resourceProps(group.etag), requestBody)}
</d:response>`);
  }
  return { status: 404, body: "Not found" };
}

function groupsAreReadOnly(): DavResponse {
  return {
    status: 403,
    body: "Groups mirror Zerrow's labels — manage them in the app",
    meta: { group: true, readOnly: true },
  };
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
  // A group card PUT to a contact path (iOS creating a group on the phone)
  // must not be stored as a person named after the group
  if (parsed.isGroup) return groupsAreReadOnly();
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
    // Stable order: paged sync resumes by offset, so two pages of the same
    // snapshot must slice the same sequence
    orderBy: { id: "asc" },
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

function groupHref(labelId: string) {
  return `${ADDRESSBOOK_PATH}/group-${encodeURIComponent(labelId)}.vcf`;
}

type Group = Awaited<ReturnType<typeof loadGroups>>[number];

// Every company label as an iOS group: members are the contacts of the
// companies carrying that label
async function loadGroups(emailAccountId: string) {
  const labels = await prisma.companyLabel.findMany({
    where: { emailAccountId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      parentId: true,
      updatedAt: true,
      companies: {
        select: {
          contacts: {
            select: { id: true, carddavUid: true, updatedAt: true },
          },
        },
      },
    },
  });
  const byId = new Map(labels.map((label) => [label.id, label]));

  return labels.map((label) => {
    const members = label.companies.flatMap((company) => company.contacts);
    return {
      id: label.id,
      // Apple's group cards have no parent concept, so nested labels
      // flatten to their path ("Factory / Toyota") — matching the
      // reference server's default
      name: labelPath(label, byId),
      updatedAt: label.updatedAt,
      memberUids: members.map((member) => member.carddavUid ?? member.id),
      etag: groupEtag(label.updatedAt, members),
    };
  });
}

function labelPath(
  label: { id: string; name: string; parentId: string | null },
  byId: Map<string, { name: string; parentId: string | null }>,
): string {
  const parts = [label.name];
  // Guard against a parent cycle — bad data would otherwise hang the sync
  const seen = new Set([label.id]);
  let parentId = label.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    seen.add(parentId);
    parentId = parent.parentId;
  }
  return parts.join(" / ");
}

function groupVCard(group: Group): string {
  return generateGroupVCard({
    // The UID doubles as the href basename, same convention as contacts
    uid: `group-${group.id}`,
    name: group.name,
    memberUids: group.memberUids,
    updatedAt: group.updatedAt,
  });
}

// A group's row in a REPORT (multiget, query, or sync-collection)
function groupReportResponse(
  group: Group,
  includeAddressData: boolean,
): string {
  return `<d:response>
  <d:href>${groupHref(group.id)}</d:href>
  <d:propstat><d:prop>
    <d:getetag>${escapeXml(group.etag)}</d:getetag>${
      includeAddressData
        ? `
    <card:address-data xmlns:card="urn:ietf:params:xml:ns:carddav">${escapeXml(groupVCard(group))}</card:address-data>`
        : ""
    }
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>`;
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

// RFC 4918: answer each requested property, with a 404 propstat for the
// ones this resource doesn't have — silently omitting a requested prop
// leaves a strict client unable to tell an incomplete answer from a
// missing property. An empty body means allprop: everything we have.
function propstats(
  available: Record<string, string>,
  requestBody: string,
): string {
  const requested = requestedProps(requestBody);
  const names = requested.length ? requested : Object.keys(available);

  // hasOwn, not a truthiness lookup: prop names come straight from the
  // client, and "constructor" must not dredge up Object.prototype as a 200
  const found = names.filter((name) => Object.hasOwn(available, name));
  const missing = requested.filter((name) => !Object.hasOwn(available, name));

  return [
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
}

// The props a single card (contact or group) can answer — shared by the
// Depth-1 listing rows and a card's own PROPFIND so the two can't drift apart
function resourceProps(etag: string): Record<string, string> {
  return {
    resourcetype: "<d:resourcetype/>",
    getetag: `<d:getetag>${escapeXml(etag)}</d:getetag>`,
    getcontenttype:
      "<d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype>",
  };
}

// decodeURIComponent that keeps malformed escapes as literal text — one bad
// href from a buggy client shouldn't turn the whole exchange into a 500
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  return (
    value
      // Control characters are illegal in XML 1.0 (tab/LF/CR excepted) —
      // one dirty byte in one contact would make the entire multistatus
      // unparseable, and the client would silently store nothing
      // biome-ignore lint/suspicious/noControlCharactersInRegex: that's the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );
}
