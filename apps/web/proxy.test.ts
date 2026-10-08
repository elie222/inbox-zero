import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { auth } from "@/utils/auth";

vi.mock("@/utils/auth", () => ({ auth: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(null);
});

describe("proxy matcher", () => {
  it("only runs for pages with a dedicated markdown representation", () => {
    expect(matchesProxy("/")).toBe(true);
    expect(matchesProxy("/pricing")).toBe(true);
    expect(matchesProxy("/pricing/")).toBe(true);
    expect(matchesProxy("/about")).toBe(false);
    expect(matchesProxy("/missing-page")).toBe(false);
    expect(matchesProxy("/api/v1/rules")).toBe(false);
  });
});

describe("proxy content negotiation", () => {
  it("returns markdown when explicitly preferred", async () => {
    const response = await proxy(
      new NextRequest("https://www.getinboxzero.com/", {
        headers: { Accept: "text/markdown, text/html;q=0.8" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("vary")).toBe("Accept");
    await expect(response.text()).resolves.toContain("# Inbox Zero");
  });

  it("passes browser requests through and advertises negotiation", async () => {
    const response = await proxy(
      new NextRequest("https://www.getinboxzero.com/pricing", {
        headers: { Accept: "text/html,application/xhtml+xml" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("never replaces RSC responses with markdown", async () => {
    const response = await proxy(
      new NextRequest("https://www.getinboxzero.com/", {
        headers: { Accept: "text/markdown", RSC: "1" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("vary")).toBe("Accept");
  });
});

describe("homepage session redirects", () => {
  it.each([
    ["__Secure-better-auth.session_token", "/automation"],
    ["__Secure-better-auth.session-token.1", "/setup"],
  ])("validates %s before redirecting to %s", async (cookie, destination) => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as Awaited<
      ReturnType<typeof auth>
    >);
    const request = new NextRequest("https://www.getinboxzero.com/?ref=home", {
      headers: { cookie: `${cookie}=valid-session` },
    });

    const response = await proxy(request);

    expect(auth).toHaveBeenCalledWith(request.headers);
    expect(response.headers.get("location")).toBe(
      `https://www.getinboxzero.com${destination}?ref=home`,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "__Secure-better-auth.session_token",
    "__Secure-better-auth.session-token.1",
  ])("keeps expired %s sessions on the homepage", async (cookie) => {
    const response = await proxy(
      new NextRequest("https://www.getinboxzero.com/", {
        headers: { cookie: `${cookie}=expired-session` },
      }),
    );

    expect(auth).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not look up sessions for visitors without a session cookie", async () => {
    const response = await proxy(
      new NextRequest("https://www.getinboxzero.com/"),
    );

    expect(auth).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect other public pages with a session cookie", async () => {
    const response = await proxy(
      new NextRequest("https://www.getinboxzero.com/pricing", {
        headers: { cookie: "__Secure-better-auth.session_token=valid-session" },
      }),
    );

    expect(auth).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

function matchesProxy(url: string) {
  return unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
}
