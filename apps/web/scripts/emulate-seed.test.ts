import { describe, expect, it } from "vitest";
import { saasFounderMixedInbox } from "../__tests__/fixtures/inboxes/demo-inboxes";
import { buildEmulateSeed } from "./emulate-seed";

describe("buildEmulateSeed", () => {
  it("includes the demo inbox messages and labels", () => {
    const seed = buildEmulateSeed();
    const messageCount = saasFounderMixedInbox.threads.reduce(
      (count, thread) => count + thread.messages.length,
      0,
    );

    expect(seed.google.messages).toHaveLength(messageCount);
    expect(seed.google.labels).toHaveLength(
      saasFounderMixedInbox.labels.length,
    );
  });

  it("uses the workspace URL for OAuth callbacks", () => {
    const baseUrl = "https://workspace.test/";
    const seed = buildEmulateSeed(baseUrl);
    const redirectUris = [
      ...seed.google.oauth_clients[0].redirect_uris,
      ...seed.microsoft.oauth_clients[0].redirect_uris,
    ];

    expect(redirectUris).not.toHaveLength(0);
    expect(
      redirectUris.every((uri) => uri.startsWith("https://workspace.test/")),
    ).toBe(true);
    expect(redirectUris.every((uri) => !uri.includes("//api/"))).toBe(true);
  });
});
