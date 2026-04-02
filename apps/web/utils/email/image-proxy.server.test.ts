import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

describe("rewriteHtmlForImageProxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("leaves html unchanged when no proxy base URL is configured", async () => {
    const { rewriteHtmlForImageProxy } = await loadModule({});
    const html = '<img src="https://cdn.example.com/photo.png" />';

    const rewritten = await rewriteHtmlForImageProxy(
      html,
      createScopedLogger("image-proxy-test"),
    );

    expect(rewritten).toBe(html);
  });

  it("rewrites remote assets through an unsigned proxy and warns once", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rewriteHtmlForImageProxy } = await loadModule({
      NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://proxy.example.com/image",
    });

    const html = '<img src="https://cdn.example.com/photo.png" />';

    const logger = createScopedLogger("image-proxy-test");
    const firstRewrite = await rewriteHtmlForImageProxy(html, logger);
    const secondRewrite = await rewriteHtmlForImageProxy(html, logger);

    expect(firstRewrite).toContain(
      'src="https://proxy.example.com/image?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png"',
    );
    expect(firstRewrite).not.toContain("&amp;e=");
    expect(firstRewrite).not.toContain("&amp;s=");
    expect(secondRewrite).toBe(firstRewrite);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rewrites remote assets with signed proxy URLs when a signing secret is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rewriteHtmlForImageProxy } = await loadModule({
      IMAGE_PROXY_SIGNING_SECRET: "test-signing-secret-123",
      NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://proxy.example.com/image",
    });

    const rewritten = await rewriteHtmlForImageProxy(
      '<img src="https://cdn.example.com/photo.png" />',
      createScopedLogger("image-proxy-test"),
    );

    expect(rewritten).toContain(
      'src="https://proxy.example.com/image?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png',
    );
    expect(rewritten).toContain("&amp;e=");
    expect(rewritten).toContain("&amp;s=");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

async function loadModule(
  overrides: Partial<{
    IMAGE_PROXY_SIGNING_SECRET: string;
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: string;
  }>,
) {
  vi.doMock("@/env", () => ({
    env: {
      AXIOM_TOKEN: undefined,
      ENABLE_DEBUG_LOGS: false,
      IMAGE_PROXY_SIGNING_SECRET: overrides.IMAGE_PROXY_SIGNING_SECRET,
      NEXT_PUBLIC_IMAGE_PROXY_BASE_URL:
        overrides.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL,
      NEXT_PUBLIC_LOG_SCOPES: undefined,
      NODE_ENV: "test",
    },
  }));

  return import("./image-proxy.server");
}
