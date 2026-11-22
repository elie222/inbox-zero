import { describe, expect, it } from "vitest";
import { getCsvPreview } from "./csv-preview";

describe("getCsvPreview", () => {
  it("parses quoted fields containing delimiters and newlines", async () => {
    const preview = await getCsvPreview(
      new Blob(['name,note\n"Acme, Inc.","line one\nline two"\n']),
    );
    expect(preview).toEqual({
      rows: [
        ["name", "note"],
        ["Acme, Inc.", "line one\nline two"],
      ],
      truncated: false,
    });
  });

  it("detects semicolon and tab delimiters", async () => {
    for (const delimiter of [";", "\t"]) {
      const preview = await getCsvPreview(
        new Blob([`a${delimiter}b\n1,5${delimiter}2\n`]),
      );
      expect(preview?.rows).toEqual([
        ["a", "b"],
        ["1,5", "2"],
      ]);
    }
  });

  it("strips a UTF-8 byte order mark and decodes Windows-1252 exports", async () => {
    const bom = await getCsvPreview(
      new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), "café,x\n"]),
    );
    expect(bom?.rows).toEqual([["café", "x"]]);

    const latin = await getCsvPreview(
      new Blob([new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x78])]),
    );
    expect(latin?.rows).toEqual([["café", "x"]]);
  });

  it("limits rows and columns and reports truncation", async () => {
    const wide = Array.from({ length: 80 }, (_, index) => `c${index}`).join(
      ",",
    );
    const lines = Array.from({ length: 1200 }, () => wide).join("\n");
    const preview = await getCsvPreview(new Blob([lines]));
    expect(preview?.rows).toHaveLength(500);
    expect(preview?.rows[0]).toHaveLength(50);
    expect(preview?.truncated).toBe(true);
  });

  it("rejects binary files mislabelled as CSV", async () => {
    const preview = await getCsvPreview(
      new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])]),
    );
    expect(preview).toBeUndefined();
  });
});
