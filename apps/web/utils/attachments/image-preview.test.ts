import { describe, expect, it } from "vitest";
import {
  getAttachmentImagePreview,
  isPreviewableImageType,
} from "./image-preview";

describe("attachment image previews", () => {
  it.each([
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["image/jpeg", [255, 216, 255, 224]],
    ["image/gif", [71, 73, 70, 56, 55, 97]],
    ["image/gif", [71, 73, 70, 56, 57, 97]],
    [
      "image/webp",
      [82, 73, 70, 70, 20, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32],
    ],
  ] as const)("derives %s from its signature and preserves bytes", async (expectedType, signature) => {
    for (const type of [
      "image/svg+xml",
      "text/html",
      "application/octet-stream",
      expectedType,
      "",
    ]) {
      const blob = new Blob([new Uint8Array(signature)], { type });
      const preview = await getAttachmentImagePreview(blob);
      expect(preview?.type).toBe(expectedType);
      expect(await preview?.arrayBuffer()).toEqual(await blob.arrayBuffer());
    }
  });

  it.each([
    "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
    "<!doctype html><html><body>Document</body></html>",
    "<?xml version='1.0'?><html xmlns='http://www.w3.org/1999/xhtml'/>",
    "%PDF-1.7",
    "GIF8",
    "RIFF1234WAVE",
    "RIFF1234WEBP",
    "",
  ])("rejects non-raster or incomplete bytes despite raster MIME metadata: %s", async (content) => {
    expect(
      await getAttachmentImagePreview(
        new Blob([content], { type: "image/png" }),
      ),
    ).toBeUndefined();
  });

  it("does not offer active or unknown image formats as attachment previews", () => {
    for (const type of [
      "image/svg+xml",
      "image/svg+xml; charset=utf-8",
      "image/unknown",
      "text/html",
      "application/pdf",
    ]) {
      expect(isPreviewableImageType(type)).toBe(false);
    }
    for (const type of [
      "image/png",
      "IMAGE/JPEG",
      "image/gif; charset=binary",
      "image/webp",
    ]) {
      expect(isPreviewableImageType(type)).toBe(true);
    }
  });
});
