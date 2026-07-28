import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

describe("CardDAV proxy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects the well-known path to the CardDAV root", async () => {
    const response = await proxy(
      davRequest("https://app.test/.well-known/carddav", { method: "GET" }),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://app.test/api/carddav",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes methods route handlers can receive straight through", async () => {
    const response = await proxy(
      davRequest("https://app.test/api/carddav", { method: "OPTIONS" }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tunnels PROPFIND to the route as POST carrying the real verb", async () => {
    fetchMock.mockResolvedValue(
      new Response("<multistatus/>", { status: 207 }),
    );

    await proxy(
      davRequest("https://app.test/api/carddav/addressbook", {
        method: "PROPFIND",
        headers: {
          authorization: "Basic dXNlcjpwYXNz",
          depth: "1",
          "content-type": "application/xml",
        },
        body: "<propfind/>",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target.toString()).toBe(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/carddav/addressbook`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe("<propfind/>");
    expect(init.headers.get("x-webdav-method")).toBe("PROPFIND");
    expect(init.headers.get("authorization")).toBe("Basic dXNlcjpwYXNz");
    expect(init.headers.get("depth")).toBe("1");
  });

  // fetch already decompressed the body, so these headers would describe
  // bytes the CardDAV client never receives
  it("drops encoding and connection headers from the tunneled response", async () => {
    fetchMock.mockResolvedValue(
      new Response("<multistatus/>", {
        status: 207,
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "content-encoding": "gzip",
          "content-length": "42",
          connection: "keep-alive",
        },
      }),
    );

    const response = await proxy(
      davRequest("https://app.test/api/carddav", { method: "PROPFIND" }),
    );

    expect(response.status).toBe(207);
    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("connection")).toBeNull();
  });

  it("keeps the auth challenge so clients know to send credentials", async () => {
    fetchMock.mockResolvedValue(
      new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Zerrow Contacts"' },
      }),
    );

    const response = await proxy(
      davRequest("https://app.test/api/carddav", { method: "PROPFIND" }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Basic realm="Zerrow Contacts"',
    );
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
