import { describe, expect, it } from "vitest";
import { saasFounderMixedInbox } from "../__tests__/fixtures/inboxes/demo-inboxes";
import { buildEmulateSeed, buildNativeEmulatorSeed } from "./emulate-seed";

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

  it("adds a second mailbox on each provider for the native runner", () => {
    const seed = buildNativeEmulatorSeed("http://127.0.0.1:3000");

    expect(seed.google.users.map((user) => user.email)).toEqual([
      "developer@example.com",
      "teammate@example.com",
    ]);
    expect(seed.microsoft.users.map((user) => user.email)).toEqual([
      "developer@outlook.test",
      "teammate@outlook.test",
    ]);
    expect(seed.google.messages?.length).toBeGreaterThan(0);
  });
});
