import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical, webCryptoSha256 } from "./canonical";

describe("canonical hashing", () => {
  it("serializes object keys in sorted order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it("produces the same digest for web crypto and node crypto", async () => {
    const value = {
      kind: "send",
      to: ["ada@example.com"],
      queuedAtMs: 0,
      nested: { z: true, a: ["b", "a"] },
    };
    const web = await hashCanonical(value, webCryptoSha256);
    const node = await hashCanonical(value, nodeSha256);
    expect(web).toBe(node);
    expect(web).toMatch(/^[0-9a-f]{64}$/);
  });
});

async function nodeSha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}
