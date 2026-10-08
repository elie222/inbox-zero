// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRemoteImages } from "./resolve-remote-images";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveRemoteImages", () => {
  it("maps each source to its proxied URL, even when some are dropped", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const { html } = JSON.parse(String(init?.body));
      // The server strips tracking pixels, so the second image disappears.
      const rendered = html
        .replace(/<img[^>]*index="1"[^>]*>/u, "")
        .replace(
          /src="https:\/\/assets\.example\.com\/([^"]+)"/gu,
          'src="https://proxy.example/p?u=$1"',
        );
      return Response.json({ html: rendered, remoteAssetsProxied: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveRemoteImages([
      "https://assets.example.com/logo.png",
      "https://assets.example.com/pixel.gif",
      "https://assets.example.com/banner.png",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/email/render-html",
      expect.objectContaining({ method: "POST" }),
    );
    expect(resolved).toEqual({
      "https://assets.example.com/logo.png":
        "https://proxy.example/p?u=logo.png",
      "https://assets.example.com/banner.png":
        "https://proxy.example/p?u=banner.png",
    });
  });

  it("returns no mappings when the proxy is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        Response.json({
          html: JSON.parse(String(init?.body)).html,
          remoteAssetsProxied: false,
        }),
      ),
    );

    expect(
      await resolveRemoteImages(["https://assets.example.com/logo.png"]),
    ).toEqual({});
  });

  it("returns no mappings when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );

    expect(
      await resolveRemoteImages(["https://assets.example.com/logo.png"]),
    ).toEqual({});
  });
});
