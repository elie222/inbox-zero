import { describe, expect, it } from "vitest";
import {
  buildSignedAssetProxyUrl,
  validateAssetProxySignature,
} from "./proxy-url.js";

describe("buildSignedAssetProxyUrl", () => {
  it("builds a signed proxy URL that can be verified", async () => {
    const now = new Date("2026-04-02T10:00:00.000Z");
    const proxyUrl = await buildSignedAssetProxyUrl({
      assetUrl: "https://cdn.example.com/image.png?size=large",
      proxyBaseUrl: "https://img.example.com/proxy",
      signingSecret: "test-signing-secret",
      ttlSeconds: 300,
      now,
    });

    const url = new URL(proxyUrl);

    expect(url.origin).toBe("https://img.example.com");
    expect(url.pathname).toBe("/proxy");
    expect(url.searchParams.get("u")).toBe(
      "https://cdn.example.com/image.png?size=large",
    );
    expect(url.searchParams.get("e")).toBe(
      (Math.floor(now.getTime() / 1000) + 300).toString(),
    );

    await expect(
      validateAssetProxySignature({
        assetUrl: url.searchParams.get("u")!,
        expiresAt: Number.parseInt(url.searchParams.get("e")!, 10),
        signature: url.searchParams.get("s")!,
        signingSecret: "test-signing-secret",
      }),
    ).resolves.toBe(true);
  });

  it("leaves non-http asset URLs untouched", async () => {
    await expect(
      buildSignedAssetProxyUrl({
        assetUrl: "cid:logo",
        proxyBaseUrl: "https://img.example.com/proxy",
        signingSecret: "test-signing-secret",
      }),
    ).resolves.toBe("cid:logo");
  });

  it("builds an unsigned proxy URL when no signing secret is configured", async () => {
    await expect(
      buildSignedAssetProxyUrl({
        assetUrl: "https://cdn.example.com/image.png",
        proxyBaseUrl: "https://proxy.example.com/image",
      }),
    ).resolves.toBe(
      "https://proxy.example.com/image?u=https%3A%2F%2Fcdn.example.com%2Fimage.png",
    );
  });
});
