import { describe, expect, it, vi } from "vitest";
import {
  fetchLogo,
  type LogoAttempt,
  normalizeLogoDomain,
} from "@/utils/logo/fetch-logo";

const PNG = "image/png";

const image = (bytes: number, contentType = PNG) =>
  new Response(new Uint8Array(bytes).fill(1), {
    status: 200,
    headers: { "content-type": contentType },
  });

describe("normalizeLogoDomain", () => {
  it("lowercases, trims, and strips www.", () => {
    expect(normalizeLogoDomain(" WWW.Example.COM ")).toBe("example.com");
  });

  it.each([
    "toyota.co.uk",
    "xn--bcher-kva.example",
    "a-b.example.io",
  ])("accepts %s", (domain) => {
    expect(normalizeLogoDomain(domain)).toBe(domain);
  });

  it.each([
    "",
    "no-dots",
    "192.168.1.1",
    "127.0.0.1",
    "-bad.example.com",
    "bad-.example.com",
    "exa mple.com",
    "example.com/path",
    "user@example.com",
  ])("rejects %s", (input) => {
    expect(normalizeLogoDomain(input)).toBe(null);
  });
});

describe("fetchLogo", () => {
  it("returns the first provider's image and stops the chain", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(image(2000));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.contentType).toBe(PNG);
    expect(logo?.body.byteLength).toBe(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain("duckduckgo");
  });

  it("starts at logo.dev when a token is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(image(2000));

    await fetchLogo({ domain: "example.com", logoDevToken: "tok", fetchImpl });

    expect(fetchImpl.mock.calls[0][0]).toContain("img.logo.dev");
    expect(fetchImpl.mock.calls[0][0]).toContain("token=tok");
  });

  it("falls through on non-image, too-small, and error responses", async () => {
    const fetchImpl = vi
      .fn()
      // duckduckgo: an HTML error page
      .mockResolvedValueOnce(
        new Response("<html>not found</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      // apple-touch-icon: a truncated/near-empty response
      .mockResolvedValueOnce(image(50))
      // apple-touch-icon-precomposed: network error
      .mockRejectedValueOnce(new Error("boom"))
      // favicon.ico: a real image
      .mockResolvedValueOnce(image(4096));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.body.byteLength).toBe(4096);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[3][0]).toBe("https://example.com/favicon.ico");
  });

  it("accepts a small favicon from the company's own site", async () => {
    // Regression: 700credit.com served a real 497-byte favicon that the
    // one-size-fits-all 600-byte floor rejected. Own-site responses have no
    // placeholder problem, so only near-empty ones are refused.
    const fetchImpl = vi
      .fn()
      // duckduckgo: 404
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      // apple-touch-icon + precomposed: 404
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      // favicon.ico: real but small
      .mockResolvedValueOnce(image(497));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.body.byteLength).toBe(497);
    expect(fetchImpl.mock.calls[3][0]).toBe("https://example.com/favicon.ico");
  });

  it("still rejects small placeholder icons from aggregators", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(image(497));

    // Every provider returns 497 bytes: the own-site ones accept it, so the
    // chain stops at the first own-site candidate — but if aggregators were
    // the only sources (no own-site hit), 497 bytes would be refused there.
    const aggregatorsOnly = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(url.includes("example.com/") ? image(10) : image(497)),
      );

    expect(
      await fetchLogo({ domain: "example.com", fetchImpl: aggregatorsOnly }),
    ).toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an SVG response (active content) and keeps looking", async () => {
    const fetchImpl = vi
      .fn()
      // duckduckgo: a large SVG — over the byte floor but must be refused,
      // since svg can carry <script> and this endpoint is served same-origin
      .mockResolvedValueOnce(image(4096, "image/svg+xml"))
      // apple-touch-icon: a real raster image
      .mockResolvedValueOnce(image(2000));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.contentType).toBe(PNG);
    expect(logo?.body.byteLength).toBe(2000);
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://example.com/apple-touch-icon.png",
    );
  });

  it("rejects an oversized response (Content-Length over the cap)", async () => {
    const oversized = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array(4096).fill(1), {
          status: 200,
          headers: {
            "content-type": PNG,
            "content-length": String(5 * 1024 * 1024),
          },
        }),
      )
      .mockResolvedValue(image(2000));

    // duckduckgo is rejected for its declared size; the next provider answers
    const logo = await fetchLogo({
      domain: "example.com",
      fetchImpl: oversized,
    });
    expect(logo?.body.byteLength).toBe(2000);
    expect(oversized.mock.calls[1][0]).toBe(
      "https://example.com/apple-touch-icon.png",
    );
  });

  it("reports each attempt's outcome through onAttempt", async () => {
    const fetchImpl = vi
      .fn()
      // duckduckgo: 404
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      // apple-touch-icon: near-empty, below even the own-site floor
      .mockResolvedValueOnce(image(50))
      // apple-touch-icon-precomposed: a real image
      .mockResolvedValueOnce(image(2048));

    const attempts: LogoAttempt[] = [];
    const logo = await fetchLogo({
      domain: "example.com",
      fetchImpl,
      onAttempt: (attempt) => attempts.push(attempt),
    });

    expect(logo?.body.byteLength).toBe(2048);
    expect(attempts.map((attempt) => attempt.outcome)).toEqual([
      "bad-status",
      "too-small-or-capped",
      "hit",
    ]);
    expect(attempts[0].status).toBe(404);
    expect(attempts[2].bytes).toBe(2048);
  });

  it("restricts the chain to one source when given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(image(10)); // nothing hits

    await fetchLogo({ domain: "example.com", source: "site", fetchImpl });

    // Only the site's own three icon candidates are tried
    expect(fetchImpl.mock.calls.map(([url]: [string]) => url)).toEqual([
      "https://example.com/apple-touch-icon.png",
      "https://example.com/apple-touch-icon-precomposed.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("source logo-dev without a configured token tries nothing", async () => {
    const fetchImpl = vi.fn();

    expect(
      await fetchLogo({ domain: "example.com", source: "logo-dev", fetchImpl }),
    ).toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when every provider fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(image(10));

    expect(await fetchLogo({ domain: "example.com", fetchImpl })).toBe(null);
    // full chain without logo.dev (no token): 5 providers
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("follows redirects, revalidating each hop through the safe fetch", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.redirect("https://cdn.example.com/logo.png", 302),
      )
      .mockResolvedValueOnce(image(2000));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.body.byteLength).toBe(2000);
    expect(fetchImpl.mock.calls[1][0]).toBe("https://cdn.example.com/logo.png");
  });

  it("refuses redirects to non-https URLs", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.startsWith("http://")
            ? image(5000)
            : Response.redirect("http://internal.example.com/logo.png", 302),
        ),
      );

    expect(await fetchLogo({ domain: "example.com", fetchImpl })).toBe(null);
    expect(
      fetchImpl.mock.calls.every(([url]: [string]) =>
        url.startsWith("https://"),
      ),
    ).toBe(true);
  });

  it("skips a host's remaining candidates after it times out", async () => {
    const timeout = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("https://example.com/")) {
        return Promise.reject(timeout);
      }
      return Promise.resolve(image(10)); // junk from the other providers
    });

    expect(await fetchLogo({ domain: "example.com", fetchImpl })).toBe(null);

    // apple-touch-icon timed out → the precomposed and favicon.ico probes
    // on the same unresponsive host are skipped
    const ownDomainCalls = fetchImpl.mock.calls.filter(([url]: [string]) =>
      url.startsWith("https://example.com/"),
    );
    expect(ownDomainCalls).toHaveLength(1);
    // …but the chain still reaches the remaining providers
    expect(
      fetchImpl.mock.calls.some(([url]: [string]) =>
        url.includes("google.com/s2"),
      ),
    ).toBe(true);
  });

  it("gives up after three redirect hops per provider", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.redirect("https://example.com/next", 302));

    expect(await fetchLogo({ domain: "example.com", fetchImpl })).toBe(null);
    // 5 providers × (1 request + 3 hops) = 20
    expect(fetchImpl).toHaveBeenCalledTimes(20);
  });
});
