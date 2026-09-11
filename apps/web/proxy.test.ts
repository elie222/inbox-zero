import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

beforeEach(() => {
  vi.clearAllMocks();
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
    const response = proxy(
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

  it("passes browser requests through and advertises negotiation", () => {
    const response = proxy(
      new NextRequest("https://www.getinboxzero.com/pricing", {
        headers: { Accept: "text/html,application/xhtml+xml" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("never replaces RSC responses with markdown", () => {
    const response = proxy(
      new NextRequest("https://www.getinboxzero.com/", {
        headers: { Accept: "text/markdown", RSC: "1" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("vary")).toBe("Accept");
  });
});

function matchesProxy(url: string) {
  return unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
}
