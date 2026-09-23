import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashCanonical } from "@inboxzero/mail-core/canonical";
import { sha256Bytes, sha256Fallback } from "./sha256";

describe("expo sha256", () => {
  it("matches node crypto for the canonical mail fixture", async () => {
    const value = {
      kind: "send",
      to: ["ada@example.com"],
      queuedAtMs: 0,
      nested: { z: true, a: ["b", "a"] },
    };
    const digest = await hashCanonical(value, async (bytes) =>
      sha256Fallback(bytes),
    );
    const node = await hashCanonical(value, nodeSha256);
    expect(digest).toBe(node);
    expect(await sha256Bytes(new TextEncoder().encode("abc"))).toEqual(
      sha256Fallback(new TextEncoder().encode("abc")),
    );
  });
});

function nodeSha256(bytes: Uint8Array) {
  return Promise.resolve(
    new Uint8Array(createHash("sha256").update(bytes).digest()),
  );
}
