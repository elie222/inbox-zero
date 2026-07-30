import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { handleCarddavRequest } from "./handler";

vi.mock("@/utils/prisma");

const EMAIL_ACCOUNT_ID = "email-account-1";
const UPDATED_AT = new Date("2026-07-01T12:00:00.000Z");

describe("CardDAV handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // iOS probes capabilities first and gives up unless addressbook support
  // is advertised
  it("advertises addressbook support on OPTIONS", async () => {
    const result = await request({ method: "OPTIONS" });

    expect(result.status).toBe(200);
    expect(result.headers?.DAV).toContain("addressbook");
    expect(result.headers?.Allow).toContain("PROPFIND");
    expect(result.headers?.Allow).toContain("REPORT");
  });

  describe("discovery", () => {
    it("points the root at the principal", async () => {
      const result = await request({ method: "PROPFIND" });

      expect(result.status).toBe(207);
      expect(result.headers?.["Content-Type"]).toBe(
        "application/xml; charset=utf-8",
      );
      expect(result.body).toContain("<d:current-user-principal>");
      expect(result.body).toContain("<d:href>/api/carddav/principal</d:href>");
    });

    it("points the principal at the addressbook home set", async () => {
      const result = await request({
        method: "PROPFIND",
        segments: ["principal"],
      });

      expect(result.status).toBe(207);
      expect(result.body).toContain("card:addressbook-home-set");
      // Slashless: a trailing-slash URL would 308 before reaching the server
      expect(result.body).toContain("<d:href>/api/carddav</d:href>");
    });

    // Apple's client finds addressbooks by listing the home set's children,
    // not by inspecting the home set itself — the listing must include the
    // addressbook collection or the account syncs nothing
    it("lists the addressbook when the home set is opened at depth 1", async () => {
      prisma.contact.findMany.mockResolvedValue([
        { updatedAt: UPDATED_AT },
      ] as never);
      prisma.contact.count.mockResolvedValue(1);

      const result = await request({ method: "PROPFIND", depth: "1" });

      expect(result.status).toBe(207);
      expect(result.body).toContain(
        "<d:href>/api/carddav/addressbook</d:href>",
      );
      expect(result.body).toContain("card:addressbook");
      expect(result.body).toContain("getctag");
    });

    it("keeps the home set listing shallow at depth 0", async () => {
      const result = await request({ method: "PROPFIND", depth: "0" });

      expect(result.status).toBe(207);
      expect(result.body).not.toContain(
        "<d:href>/api/carddav/addressbook</d:href>",
      );
    });

    // iOS's first request asks for these three by name (the A: prefix is
    // what Apple's client actually sends) — each must be answered, and the
    // response href must be the path that was asked about
    it("answers exactly what an iOS discovery request asks for", async () => {
      const result = await request({
        method: "PROPFIND",
        body: `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <A:current-user-principal/>
    <A:principal-URL/>
    <A:resourcetype/>
  </A:prop>
</A:propfind>`,
        requestPath: "/api/carddav",
      });

      expect(result.status).toBe(207);
      expect(result.body).toContain("<d:href>/api/carddav</d:href>");
      expect(result.body).toContain("<d:current-user-principal>");
      expect(result.body).toContain(
        "<d:principal-URL><d:href>/api/carddav/principal</d:href></d:principal-URL>",
      );
      expect(result.body).toContain("<d:resourcetype><d:collection/>");
    });

    it("returns a 404 propstat for a requested prop it doesn't have", async () => {
      const result = await request({
        method: "PROPFIND",
        body: `<propfind xmlns="DAV:"><prop><current-user-principal/><quota-available-bytes/></prop></propfind>`,
      });

      expect(result.body).toContain("<d:quota-available-bytes/>");
      expect(result.body).toContain("HTTP/1.1 404 Not Found");
      // The found prop still comes back 200
      expect(result.body).toContain("<d:current-user-principal>");
      expect(result.body).toContain("HTTP/1.1 200 OK");
    });

    it("answers everything it has when the client sends no body", async () => {
      const result = await request({ method: "PROPFIND" });

      expect(result.body).toContain("<d:current-user-principal>");
      expect(result.body).toContain("<d:principal-URL>");
      expect(result.body).not.toContain("404");
    });
  });

  describe("addressbook PROPFIND", () => {
    it("returns the collection alone at depth 0", async () => {
      prisma.contact.findMany.mockResolvedValue([
        { id: "c1", carddavUid: "uid-1", updatedAt: UPDATED_AT },
      ] as never);

      const result = await request({
        method: "PROPFIND",
        segments: ["addressbook"],
        depth: "0",
      });

      expect(result.status).toBe(207);
      expect(result.body).toContain("card:addressbook");
      expect(result.body).toContain("cs:getctag");
      expect(result.body).not.toContain("uid-1.vcf");
    });

    it("lists each contact with an etag at depth 1", async () => {
      prisma.contact.findMany.mockResolvedValue([
        { id: "c1", carddavUid: "uid-1", updatedAt: UPDATED_AT },
        { id: "c2", carddavUid: null, updatedAt: UPDATED_AT },
      ] as never);

      const result = await request({
        method: "PROPFIND",
        segments: ["addressbook"],
        depth: "1",
      });

      expect(result.body).toContain("/api/carddav/addressbook/uid-1.vcf");
      // Contacts that predate CardDAV fall back to their row id
      expect(result.body).toContain("/api/carddav/addressbook/c2.vcf");
      expect(result.body).toContain(
        `<d:getetag>"${UPDATED_AT.getTime()}"</d:getetag>`,
      );
    });

    // The ctag is how iOS decides whether to re-download anything
    it("changes the ctag when a contact is added or edited", async () => {
      prisma.contact.findMany.mockResolvedValue([
        { id: "c1", carddavUid: "uid-1", updatedAt: UPDATED_AT },
      ] as never);
      const before = await request({
        method: "PROPFIND",
        segments: ["addressbook"],
        depth: "0",
      });

      prisma.contact.findMany.mockResolvedValue([
        { id: "c1", carddavUid: "uid-1", updatedAt: new Date("2026-07-02") },
        { id: "c2", carddavUid: "uid-2", updatedAt: UPDATED_AT },
      ] as never);
      const after = await request({
        method: "PROPFIND",
        segments: ["addressbook"],
        depth: "0",
      });

      expect(getCtag(after.body)).not.toBe(getCtag(before.body));
    });

    // The generation prefix is the server-side reset switch: bumping it
    // invalidates every client's stored ctag and forces a full re-download
    it("prefixes the ctag with the current generation", async () => {
      prisma.contact.findMany.mockResolvedValue([
        { id: "c1", carddavUid: "uid-1", updatedAt: UPDATED_AT },
      ] as never);

      const result = await request({
        method: "PROPFIND",
        segments: ["addressbook"],
        depth: "0",
      });

      expect(getCtag(result.body)).toMatch(/^"2-/);
    });

    // Modern iOS picks the sync-collection path when the server offers it —
    // the addressbook must advertise the report and expose a sync token
    it("advertises sync-collection with a sync token", async () => {
      prisma.contact.findMany.mockResolvedValue([
        { id: "c1", carddavUid: "uid-1", updatedAt: UPDATED_AT },
      ] as never);

      const result = await request({
        method: "PROPFIND",
        segments: ["addressbook"],
        depth: "0",
      });

      expect(result.body).toContain("<d:sync-collection/>");
      expect(result.body).toMatch(
        /<d:sync-token>urn:zerrow:carddav:[^<]+<\/d:sync-token>/,
      );
      expect(result.body).toContain("card:supported-address-data");
    });
  });

  describe("REPORT", () => {
    it("returns vCard data for every contact on addressbook-query", async () => {
      prisma.contact.findMany.mockResolvedValue([fullContact()] as never);

      const result = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: '<card:addressbook-query xmlns:card="urn:ietf:params:xml:ns:carddav"/>',
      });

      expect(result.status).toBe(207);
      expect(result.body).toContain("card:address-data");
      expect(result.body).toContain("BEGIN:VCARD");
      expect(result.body).toContain("FN:Ada Lovelace");
      expect(result.body).toContain("TEL;TYPE=CELL:+1 555 0100");
    });

    it("returns only the requested hrefs on addressbook-multiget", async () => {
      prisma.contact.findMany.mockResolvedValue([
        fullContact(),
        fullContact({
          id: "c2",
          carddavUid: "uid-2",
          email: "grace@example.com",
          name: "Grace Hopper",
        }),
      ] as never);

      const result = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: `<card:addressbook-multiget xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
  <d:href>/api/carddav/addressbook/uid-2.vcf</d:href>
</card:addressbook-multiget>`,
      });

      expect(result.body).toContain("Grace Hopper");
      expect(result.body).not.toContain("Ada Lovelace");
    });

    // An unrecognized REPORT must not be answered with a full dump — a
    // sync-collection client, for one, would read it as an invalid response
    it("answers an unknown REPORT with an empty multistatus", async () => {
      prisma.contact.findMany.mockResolvedValue([fullContact()] as never);

      const result = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: '<x:some-unknown-report xmlns:x="urn:example"/>',
      });

      expect(result.status).toBe(207);
      expect(result.body).not.toContain("address-data");
      expect(result.body).not.toContain("Ada Lovelace");
    });
  });

  describe("sync-collection", () => {
    const syncBody = (token: string) => `<?xml version="1.0" encoding="UTF-8"?>
<d:sync-collection xmlns:d="DAV:">
  ${token ? `<d:sync-token>${token}</d:sync-token>` : "<d:sync-token/>"}
  <d:sync-level>1</d:sync-level>
  <d:prop><d:getetag/></d:prop>
</d:sync-collection>`;

    const getSyncToken = (body: string | undefined) =>
      body?.match(/<d:sync-token>([^<]+)<\/d:sync-token>/)?.[1];

    it("returns every contact plus a sync token on initial sync", async () => {
      prisma.contact.findMany.mockResolvedValue([
        fullContact(),
        fullContact({ id: "c2", carddavUid: "uid-2", name: "Grace Hopper" }),
      ] as never);
      prisma.contact.count.mockResolvedValue(2);

      const result = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: syncBody(""),
      });

      expect(result.status).toBe(207);
      expect(result.body).toContain("/api/carddav/addressbook/uid-1.vcf");
      expect(result.body).toContain("/api/carddav/addressbook/uid-2.vcf");
      expect(getSyncToken(result.body)).toMatch(/^urn:zerrow:carddav:/);
      // The client asked for getetag only — no vCard payloads
      expect(result.body).not.toContain("BEGIN:VCARD");
    });

    it("includes vCard data when the client asks for address-data", async () => {
      prisma.contact.findMany.mockResolvedValue([fullContact()] as never);
      prisma.contact.count.mockResolvedValue(1);

      const result = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: `<d:sync-collection xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:sync-token/>
  <d:prop><d:getetag/><card:address-data/></d:prop>
</d:sync-collection>`,
      });

      expect(result.body).toContain("BEGIN:VCARD");
      expect(result.body).toContain("FN:Ada Lovelace");
    });

    it("reports no changes when the client's token is current", async () => {
      prisma.contact.findMany.mockResolvedValue([fullContact()] as never);
      prisma.contact.count.mockResolvedValue(1);

      const initial = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: syncBody(""),
      });
      const token = getSyncToken(initial.body);
      expect(token).toBeTruthy();

      const followUp = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: syncBody(token ?? ""),
      });

      expect(followUp.status).toBe(207);
      expect(followUp.body).not.toContain("getetag");
      expect(getSyncToken(followUp.body)).toBe(token);
    });

    // RFC 6578: an expired token gets valid-sync-token, which tells the
    // client to fall back to a full resync — how deletes propagate here
    it("rejects a stale token so the client resyncs from scratch", async () => {
      prisma.contact.findMany.mockResolvedValue([fullContact()] as never);
      prisma.contact.count.mockResolvedValue(1);

      const result = await request({
        method: "REPORT",
        segments: ["addressbook"],
        body: syncBody("urn:zerrow:carddav:2-1000-42"),
      });

      expect(result.status).toBe(403);
      expect(result.body).toContain("valid-sync-token");
    });
  });

  describe("per-contact requests", () => {
    it("serves a single contact as vCard with an etag", async () => {
      prisma.contact.findFirst.mockResolvedValue(fullContact() as never);

      const result = await request({
        method: "GET",
        segments: ["addressbook", "uid-1.vcf"],
      });

      expect(result.status).toBe(200);
      expect(result.headers?.["Content-Type"]).toBe(
        "text/vcard; charset=utf-8",
      );
      expect(result.headers?.ETag).toBe(`"${UPDATED_AT.getTime()}"`);
      expect(result.body).toContain("BEGIN:VCARD");
    });

    it("updates the matching contact when iOS edits one", async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: "c1" } as never);
      prisma.contact.update.mockResolvedValue({
        updatedAt: UPDATED_AT,
      } as never);

      const result = await request({
        method: "PUT",
        segments: ["addressbook", "uid-1.vcf"],
        body: vcard({ uid: "uid-1", email: "ada@example.com", fn: "Ada L" }),
      });

      expect(result.status).toBe(204);
      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: expect.objectContaining({ name: "Ada L", carddavUid: "uid-1" }),
      });
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it("creates a contact iOS added on the phone", async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({
        updatedAt: UPDATED_AT,
      } as never);

      const result = await request({
        method: "PUT",
        segments: ["addressbook", "ios-uid.vcf"],
        body: vcard({
          uid: "ios-uid",
          email: "new@example.com",
          fn: "New Person",
        }),
      });

      expect(result.status).toBe(201);
      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          emailAccountId: EMAIL_ACCOUNT_ID,
          email: "new@example.com",
        }),
      });
    });

    it("deletes the matching contact", async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: "c1" } as never);
      prisma.contact.delete.mockResolvedValue({} as never);

      const result = await request({
        method: "DELETE",
        segments: ["addressbook", "uid-1.vcf"],
      });

      expect(result.status).toBe(204);
      expect(prisma.contact.delete).toHaveBeenCalledWith({
        where: { id: "c1" },
      });
    });

    it("404s a contact that isn't ours", async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await request({
        method: "GET",
        segments: ["addressbook", "someone-elses.vcf"],
      });

      expect(result.status).toBe(404);
    });
  });

  it("404s paths outside the addressbook", async () => {
    const result = await request({ method: "GET", segments: ["calendars"] });

    expect(result.status).toBe(404);
  });
});

function request({
  method,
  segments = [],
  depth = "0",
  body = "",
  requestPath,
}: {
  method: string;
  segments?: string[];
  depth?: string;
  body?: string;
  requestPath?: string;
}) {
  return handleCarddavRequest({
    method,
    segments,
    depth,
    body,
    emailAccountId: EMAIL_ACCOUNT_ID,
    requestPath,
  });
}

function fullContact(
  overrides: Partial<{
    id: string;
    carddavUid: string | null;
    email: string;
    name: string | null;
  }> = {},
) {
  return {
    id: "c1",
    carddavUid: "uid-1",
    email: "ada@example.com",
    name: "Ada Lovelace",
    phones: [{ label: "Mobile", value: "+1 555 0100" }],
    title: "Engineer",
    updatedAt: UPDATED_AT,
    company: { name: "Analytical Engines" },
    ...overrides,
  };
}

function vcard({ uid, email, fn }: { uid: string; email: string; fn: string }) {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid}`,
    `FN:${fn}`,
    `EMAIL;TYPE=INTERNET:${email}`,
    "END:VCARD",
  ].join("\r\n");
}

function getCtag(body: string | undefined) {
  return body?.match(/<cs:getctag[^>]*>([^<]+)</)?.[1];
}
