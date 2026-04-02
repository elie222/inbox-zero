import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));

describe("rewriteMessagesRemoteAssets", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("leaves messages unchanged when no proxy base URL is configured", async () => {
    const { rewriteMessagesRemoteAssets } = await loadModule({});
    const messages = [
      createMessage('<img src="https://cdn.example.com/photo.png" />'),
    ];

    const rewritten = await rewriteMessagesRemoteAssets(messages);

    expect(rewritten).toBe(messages);
  });

  it("rewrites remote assets through an unsigned proxy and warns once", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rewriteMessagesRemoteAssets } = await loadModule({
      NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://proxy.example.com/image",
    });

    const messages = [
      createMessage('<img src="https://cdn.example.com/photo.png" />'),
    ];

    const firstRewrite = await rewriteMessagesRemoteAssets(messages);
    const secondRewrite = await rewriteMessagesRemoteAssets(messages);

    expect(firstRewrite[0].textHtml).toContain(
      'src="https://proxy.example.com/image?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png"',
    );
    expect(firstRewrite[0].textHtml).not.toContain("&amp;e=");
    expect(firstRewrite[0].textHtml).not.toContain("&amp;s=");
    expect(secondRewrite[0].textHtml).toBe(firstRewrite[0].textHtml);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rewrites remote assets with signed proxy URLs when a signing secret is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rewriteMessagesRemoteAssets } = await loadModule({
      IMAGE_PROXY_SIGNING_SECRET: "test-signing-secret-123",
      NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://proxy.example.com/image",
    });

    const rewritten = await rewriteMessagesRemoteAssets([
      createMessage('<img src="https://cdn.example.com/photo.png" />'),
    ]);

    expect(rewritten[0].textHtml).toContain(
      'src="https://proxy.example.com/image?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png',
    );
    expect(rewritten[0].textHtml).toContain("&amp;e=");
    expect(rewritten[0].textHtml).toContain("&amp;s=");
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

function createMessage(textHtml: string): ParsedMessage {
  return {
    date: "2026-04-03T10:00:00.000Z",
    headers: {
      date: "Fri, 3 Apr 2026 10:00:00 +0000",
      from: "sender@example.com",
      subject: "Subject",
      to: "user@example.com",
    },
    historyId: "history-1",
    id: "message-1",
    inline: [],
    snippet: "Snippet",
    subject: "Subject",
    textHtml,
    threadId: "thread-1",
  };
}
