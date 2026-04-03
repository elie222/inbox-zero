import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleImageProxyRequest } from "./proxy-service.js";
import { buildSignedAssetProxyUrl } from "./proxy-url.js";

describe("handleImageProxyRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a health response without hitting upstream fetch", async () => {
    const upstreamFetch = vi.fn();

    const response = await handleImageProxyRequest(
      new Request("https://proxy.example.com/health"),
      {},
      { fetchImpl: upstreamFetch as typeof fetch },
    );

    await expect(response.text()).resolves.toBe("ok");
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https://cdn.example.com/a.png",
        {
          method: "POST",
        },
      ),
      {},
    );

    expect(response.status).toBe(405);
  });

  it("rejects requests without an asset URL", async () => {
    const response = await handleImageProxyRequest(
      new Request("https://proxy.example.com/proxy"),
      {},
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing asset URL");
  });

  it("rejects unsupported asset URL schemes", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=data:image/png;base64,abc",
      ),
      {},
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unsupported asset URL");
  });

  it("blocks requests to local upstream hosts", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=http%3A%2F%2Flocalhost%2Fimage.png",
      ),
      {},
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Blocked upstream host");
  });

  it("does not block legitimate domains that start with fc or fd", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(createImageResponse());

    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Ffcm.googleapis.com%2Fphoto.png",
      ),
      {},
      { fetchImpl: upstreamFetch as typeof fetch },
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts unsigned requests when no signing secret is configured", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response("image-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      {},
      { fetchImpl: upstreamFetch as typeof fetch },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
  });

  it("returns cached responses without hitting upstream fetch", async () => {
    const cachedResponse = new Response("cached-image", {
      status: 200,
      headers: { "content-type": "image/png" },
    });
    const cache = {
      match: vi.fn().mockResolvedValue(cachedResponse),
      put: vi.fn(),
    };
    const upstreamFetch = vi.fn();

    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      {},
      {
        cache,
        fetchImpl: upstreamFetch as typeof fetch,
      },
    );

    expect(response).toBe(cachedResponse);
    expect(cache.match).toHaveBeenCalledTimes(1);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("requires a valid signature when a signing secret is configured", async () => {
    const proxyUrl = await buildSignedAssetProxyUrl({
      assetUrl: "https://cdn.example.com/photo.png",
      proxyBaseUrl: "https://proxy.example.com/proxy",
      signingSecret: "test-signing-secret",
      ttlSeconds: 300,
      now: Date.now(),
    });

    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response("image-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const response = await handleImageProxyRequest(
      new Request(proxyUrl),
      { signingSecret: "test-signing-secret" },
      { fetchImpl: upstreamFetch as typeof fetch },
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects signed mode requests without signature params", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      { signingSecret: "test-signing-secret" },
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing proxy signature");
  });

  it("rejects expired signed URLs", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png&e=1&s=ignored",
      ),
      { signingSecret: "test-signing-secret" },
    );

    expect(response.status).toBe(410);
    await expect(response.text()).resolves.toBe("Expired proxy URL");
  });

  it("rejects invalid signatures", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-04-03T10:00:00.000Z").getTime(),
    );

    const proxyUrl = await buildSignedAssetProxyUrl({
      assetUrl: "https://cdn.example.com/photo.png",
      proxyBaseUrl: "https://proxy.example.com/proxy",
      signingSecret: "test-signing-secret",
      ttlSeconds: 300,
      now: new Date("2026-04-03T10:00:00.000Z"),
    });
    const invalidProxyUrl = new URL(proxyUrl);
    invalidProxyUrl.searchParams.set("s", "invalid-signature");

    const response = await handleImageProxyRequest(
      new Request(invalidProxyUrl),
      { signingSecret: "test-signing-secret" },
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Invalid proxy signature");
  });

  it("returns upstream failures without caching them", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn(),
    };
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fmissing.png",
      ),
      {},
      {
        cache,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            new Response("not found", { status: 404 }),
          ) as typeof fetch,
      },
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Upstream fetch failed");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("rejects unsupported upstream content types", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fpage.html",
      ),
      {},
      {
        fetchImpl: vi.fn().mockResolvedValue(
          new Response("<html></html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ) as typeof fetch,
      },
    );

    expect(response.status).toBe(415);
    await expect(response.text()).resolves.toBe("Unsupported content type");
  });

  it("blocks redirects to local targets", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      {},
      {
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            Response.redirect("http://localhost/private.png", 302),
          ) as typeof fetch,
      },
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Upstream fetch failed");
  });

  it("returns a controlled 502 when an upstream redirect location is malformed", async () => {
    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      {},
      {
        fetchImpl: vi.fn().mockResolvedValue(
          // biome-ignore lint/suspicious/useStaticResponseMethods: invalid redirect targets cannot be expressed with Response.redirect()
          new Response(null, {
            status: 302,
            headers: { location: "https://%" },
          }),
        ) as typeof fetch,
      },
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toBe("Upstream fetch failed");
  });

  it("stops redirect loops after the maximum depth", async () => {
    const upstreamFetch = vi
      .fn()
      .mockResolvedValue(
        Response.redirect("https://cdn.example.com/photo.png", 302),
      );
    const logger = {
      warn: vi.fn(),
    };

    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      {},
      { fetchImpl: upstreamFetch as typeof fetch, logger },
    );

    expect(response.status).toBe(508);
    await expect(response.text()).resolves.toBe("Upstream fetch failed");
    expect(upstreamFetch).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledWith(
      "Image proxy redirect limit exceeded",
      {
        initialUrl: "https://cdn.example.com/photo.png",
        method: "GET",
        redirectChain: [
          "https://cdn.example.com/photo.png",
          "https://cdn.example.com/photo.png",
          "https://cdn.example.com/photo.png",
        ],
      },
    );
  });

  it("stores successful GET responses in cache via waitUntil", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn(),
    };
    const executionContext = { waitUntil: vi.fn() };

    const response = await handleImageProxyRequest(
      new Request(
        "https://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      ),
      {},
      {
        cache,
        executionContext,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(createImageResponse()) as typeof fetch,
      },
    );

    expect(response.status).toBe(200);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(executionContext.waitUntil).toHaveBeenCalledTimes(1);
  });
});

function createImageResponse() {
  return new Response("image-bytes", {
    status: 200,
    headers: {
      "content-type": "image/png",
      "set-cookie": "blocked=true",
    },
  });
}
