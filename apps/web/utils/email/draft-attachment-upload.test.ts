import { describe, expect, it } from "vitest";
import {
  encodeMimeBase64,
  GMAIL_UPLOAD_CHUNK_BYTES,
  getDraftMessageUploadLength,
  mimeBase64Length,
  parseContentRange,
  validateGmailUploadChunk,
} from "./draft-attachment-upload";

describe("mimeBase64Length", () => {
  it.each([
    0, 1, 2, 3, 56, 57, 58, 114, 1000, 1_048_576,
  ])("matches the encoded length of %i bytes", (size) => {
    const encoded = encodeMimeBase64(bytesOf(size));
    expect(mimeBase64Length(size)).toBe(encoded.length);
  });

  it("wraps lines at 76 characters with CRLF and no trailing break", () => {
    const encoded = encodeMimeBase64(bytesOf(200));
    const lines = encoded.split("\r\n");
    expect(lines.slice(0, -1).every((line) => line.length === 76)).toBe(true);
    expect(encoded.endsWith("\r\n")).toBe(false);
    expect(Buffer.from(lines.join(""), "base64")).toEqual(
      Buffer.from(bytesOf(200)),
    );
  });
});

describe("getDraftMessageUploadLength", () => {
  it("adds the text parts to each attachment's encoded size", () => {
    expect(
      getDraftMessageUploadLength([
        { type: "text", text: "head\r\n\r\n" },
        { type: "attachment", attachmentId: "a", size: 58 },
        { type: "text", text: "\r\n--b--" },
      ]),
    ).toBe(8 + mimeBase64Length(58) + 7);
  });

  it("counts text in the UTF-8 bytes the client uploads", () => {
    const parts = [{ type: "text" as const, text: "Café ✓\r\n" }];
    expect(getDraftMessageUploadLength(parts)).toBe(
      new Blob([parts[0]!.text]).size,
    );
  });
});

describe("validateGmailUploadChunk", () => {
  const totalBytes = GMAIL_UPLOAD_CHUNK_BYTES * 2 + 100;

  it("accepts full chunks in order and a short final chunk", () => {
    expect(
      validateGmailUploadChunk({
        start: 0,
        length: GMAIL_UPLOAD_CHUNK_BYTES,
        totalBytes,
        expectedStart: 0,
      }),
    ).toEqual({ valid: true });
    expect(
      validateGmailUploadChunk({
        start: GMAIL_UPLOAD_CHUNK_BYTES * 2,
        length: 100,
        totalBytes,
        expectedStart: GMAIL_UPLOAD_CHUNK_BYTES * 2,
      }),
    ).toEqual({ valid: true });
  });

  it("accepts a smaller chunk that keeps Gmail's 256 KiB granularity", () => {
    expect(
      validateGmailUploadChunk({
        start: 0,
        length: 256 * 1024,
        totalBytes,
        expectedStart: 0,
      }),
    ).toEqual({ valid: true });
  });

  it.each([
    ["out of order", { start: 256 * 1024, length: 256 * 1024 }],
    ["too large", { start: 0, length: GMAIL_UPLOAD_CHUNK_BYTES + 256 * 1024 }],
    ["empty", { start: 0, length: 0 }],
    ["misaligned before the end", { start: 0, length: 1000 }],
    ["past the end", { start: 0, length: totalBytes + 1 }],
  ])("rejects a chunk that is %s", (_name, chunk) => {
    expect(
      validateGmailUploadChunk({ ...chunk, totalBytes, expectedStart: 0 })
        .valid,
    ).toBe(false);
  });
});

describe("parseContentRange", () => {
  it.each([
    null,
    "bytes */100",
    "bytes 20-10/100",
    "items 0-1/2",
  ])("rejects %s", (header) => {
    expect(parseContentRange(header)).toBeNull();
  });
});

function bytesOf(size: number) {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31) % 256);
}
