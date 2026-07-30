import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { hashCarddavPassword } from "@/utils/carddav/auth";
import { proxy } from "./proxy";

vi.mock("@/utils/prisma");

// One saved contact so PROPFIND/REPORT have something to serve
const CONTACT = {
  id: "c1",
  carddavUid: "uid-1",
  email: "jane@example.com",
  name: "Jane Doe",
  phones: [],
  title: null,
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  company: null,
};

const ACCOUNT = {
  id: "acc_1",
  email: "chris@nucar.com",
  carddavPasswordHash: hashCarddavPassword("secret"),
};

const AUTH = `Basic ${Buffer.from("chris@nucar.com:secret").toString("base64")}`;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.emailAccount.findFirst.mockResolvedValue(ACCOUNT as never);
  prisma.contact.findMany.mockResolvedValue([CONTACT] as never);
});

describe("CardDAV proxy", () => {
  it("redirects the well-known path to the CardDAV root", async () => {
    const response = await proxy(
      davRequest("https://app.test/.well-known/carddav", { method: "GET" }),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://app.test/api/carddav",
    );
  });

  it("passes standard verbs through to the route handler", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav", { method: "GET" }),
    );

    // NextResponse.next() — the route handles it
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  // Apple's client canonicalizes collection URLs with a trailing slash; the
  // route pattern is slashless, so the proxy must bridge the two forms
  it("rewrites slashed standard-verb requests to the slashless route", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav/addressbook/", {
        method: "OPTIONS",
      }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://app.test/api/carddav/addressbook",
    );
  });

  it("answers PROPFIND on the slashed collection form directly", async () => {
    prisma.contact.count.mockResolvedValue(1);

    const response = await proxy(
      davRequest("https://app.test/api/carddav/addressbook/", {
        method: "PROPFIND",
        headers: { authorization: AUTH, depth: "0" },
      }),
    );

    expect(response.status).toBe(207);
    expect(await response.text()).toContain("getctag");
  });

  // With skipTrailingSlashRedirect on, the proxy owns the strip-the-slash
  // redirect Next used to inject for the rest of the app. Built from a plain
  // URL — NextURL would re-append the slash and redirect to itself, looping.
  it("redirects non-CardDAV trailing-slash URLs to the slashless form", async () => {
    const response = await proxy(
      davRequest("https://app.test/settings/?tab=email", { method: "GET" }),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://app.test/settings?tab=email",
    );
  });

  it("leaves slashless non-CardDAV URLs alone", async () => {
    const response = await proxy(
      davRequest("https://app.test/settings", { method: "GET" }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  // No self-fetch any more: the WebDAV verb is answered here, in one hop
  it("answers PROPFIND directly without tunneling", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav", {
        method: "PROPFIND",
        headers: { authorization: AUTH, depth: "0" },
        body: '<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>',
      }),
    );

    expect(response.status).toBe(207);
    expect(await response.text()).toContain("current-user-principal");
  });

  it("serves the address book on a REPORT", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav/addressbook", {
        method: "REPORT",
        headers: { authorization: AUTH },
        body: `<card:addressbook-query xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:"><d:prop><d:getetag/><card:address-data/></d:prop></card:addressbook-query>`,
      }),
    );

    expect(response.status).toBe(207);
    expect(await response.text()).toContain("jane@example.com");
  });

  it("challenges an unauthenticated WebDAV request", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav", { method: "PROPFIND" }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Basic realm="Zerrow Contacts"',
    );
  });

  it("rejects a wrong password", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav", {
        method: "PROPFIND",
        headers: {
          authorization: `Basic ${Buffer.from("chris@nucar.com:wrong").toString("base64")}`,
        },
      }),
    );

    expect(response.status).toBe(401);
  });
});

function davRequest(
  url: string,
  {
    method,
    headers,
    body,
  }: { method: string; headers?: Record<string, string>; body?: string },
) {
  return new NextRequest(url, { method, headers, body });
}
