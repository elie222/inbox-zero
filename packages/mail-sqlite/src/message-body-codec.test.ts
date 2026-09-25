import { describe, expect, it } from "vitest";
import {
  decodeMessageBody,
  encodeMessageBody,
  streamBodyCodec,
} from "./message-body-codec";
import { nodeBodyCodec } from "./node-sqlite";

const newsletter = `<html><body>${"<p>Weekly digest — 市場 update</p>".repeat(200)}</body></html>`;

describe("message body codec", () => {
  it.each([
    ["zlib", nodeBodyCodec],
    ["compression streams", streamBodyCodec],
  ])("round-trips bodies with %s", async (_name, codec) => {
    for (const body of ["", "ok", "Grüße 👋", newsletter]) {
      const stored = await encodeMessageBody(codec, body);
      expect(await decodeMessageBody(codec, stored)).toBe(body);
    }
    expect(await encodeMessageBody(codec, null)).toBeNull();
  });

  it("stores large bodies compressed and reads them with either runtime's codec", async () => {
    const stored = await encodeMessageBody(nodeBodyCodec, newsletter);

    expect(stored?.length).toBeLessThan(newsletter.length / 10);
    expect(await decodeMessageBody(streamBodyCodec, stored)).toBe(newsletter);
  });

  it("reads bodies stored as text before compression", async () => {
    expect(await decodeMessageBody(nodeBodyCodec, "<p>legacy</p>")).toBe(
      "<p>legacy</p>",
    );
    expect(await decodeMessageBody(nodeBodyCodec, null)).toBeNull();
  });

  it("rejects a body format it does not know", async () => {
    await expect(
      decodeMessageBody(nodeBodyCodec, new Uint8Array([9, 1, 2])),
    ).rejects.toThrow("Unknown message body format");
  });
});
