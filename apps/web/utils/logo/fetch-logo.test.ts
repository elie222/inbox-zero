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
    expect(fetchImpl.mock.calls[0][0]).toContain("logo.clearbit.com");
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
      // clearbit: an HTML error page
      .mockResolvedValueOnce(
        new Response("<html>not found</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      // duckduckgo: a placeholder pixel below the size floor
      .mockResolvedValueOnce(image(50))
      // apple-touch-icon: network error
      .mockRejectedValueOnce(new Error("boom"))
      // apple-touch-icon-precomposed: a real image
      .mockResolvedValueOnce(image(4096));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.body.byteLength).toBe(4096);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[3][0]).toBe(
      "https://example.com/apple-touch-icon-precomposed.png",
    );
  });

  it("rejects an SVG response (active content) and keeps looking", async () => {
    const fetchImpl = vi
      .fn()
      // clearbit: a large SVG — over the byte floor but must be refused,
      // since svg can carry <script> and this endpoint is served same-origin
      .mockResolvedValueOnce(image(4096, "image/svg+xml"))
      // duckduckgo: a real raster image
      .mockResolvedValueOnce(image(2000));

    const logo = await fetchLogo({ domain: "example.com", fetchImpl });

    expect(logo?.contentType).toBe(PNG);
    expect(logo?.body.byteLength).toBe(2000);
    expect(fetchImpl.mock.calls[1][0]).toContain("duckduckgo");
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

    // clearbit is rejected for its declared size; duckduckgo then answers
    const logo = await fetchLogo({
      domain: "example.com",
      fetchImpl: oversized,
    });
    expect(logo?.body.byteLength).toBe(2000);
    expect(oversized.mock.calls[1][0]).toContain("duckduckgo");
  });

  it("reports each attempt's outcome through onAttempt", async () => {
    const fetchImpl = vi
      .fn()
      // clearbit: 404
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      // duckduckgo: placeholder below the size floor
      .mockResolvedValueOnce(image(50))
      // apple-touch-icon: a real image
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

  it("returns null when every provider fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(image(10));

    expect(await fetchLogo({ domain: "example.com", fetchImpl })).toBe(null);
    // full chain without logo.dev (no token): 6 providers
    expect(fetchImpl).toHaveBeenCalledTimes(6);
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
    // 6 providers × (1 request + 3 hops) = 24
    expect(fetchImpl).toHaveBeenCalledTimes(24);
  });
});
