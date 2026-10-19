import { encodeImage } from "utif2";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAttachmentImagePreview,
  getAttachmentPreview,
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
      "image/tiff",
    ]) {
      expect(isPreviewableImageType(type)).toBe(true);
    }
  });

  it("types PDFs from their signature for the full preview", async () => {
    for (const [type, content] of [
      ["application/octet-stream", "%PDF-1.7\n"],
      ["text/html", "%PDF-1.7\n"],
      ["", "\r\n%PDF-1.4\n"],
    ]) {
      const blob = new Blob([content], { type });
      const preview = await getAttachmentPreview(blob);
      expect(preview?.type).toBe("application/pdf");
      expect(await preview?.arrayBuffer()).toEqual(await blob.arrayBuffer());
    }
  });

  it.each([
    "<!doctype html><html><body>Document</body></html>",
    "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
    "%PDF",
    "",
  ])("does not open non-PDF bytes declared as PDF: %s", async (content) => {
    expect(
      await getAttachmentPreview(
        new Blob([content], { type: "application/pdf" }),
      ),
    ).toBeUndefined();
  });

  describe("TIFF images", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("converts TIFF bytes to a PNG that browsers can render", async () => {
      const drawn = stubCanvas();
      const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]);
      const tiff = new Blob([encodeImage(rgba, 2, 1)], {
        type: "application/octet-stream",
      });

      const preview = await getAttachmentImagePreview(tiff);

      expect(preview?.type).toBe("image/png");
      expect(drawn).toEqual([{ width: 2, height: 1, pixels: [...rgba] }]);
    });

    it("does not decode TIFF images too large to render", async () => {
      const drawn = stubCanvas();
      const tiff = new Blob([
        encodeImage(new Uint8Array(4), 1, 1, {
          t256: [20_000],
          t257: [20_000],
        } as never),
      ]);

      expect(await getAttachmentImagePreview(tiff)).toBeUndefined();
      expect(drawn).toEqual([]);
    });

    it.each([
      ["an IFD chain that loops back on itself", loopingTiff()],
      ["a tag count larger than the file", oversizedCountTiff()],
      ["sub-IFDs that point back at their parent", loopingSubIfdTiff()],
    ])("rejects malformed TIFF structure without decoding: %s", async (_, bytes) => {
      const drawn = stubCanvas();

      expect(
        await getAttachmentImagePreview(new Blob([bytes])),
      ).toBeUndefined();
      expect(drawn).toEqual([]);
    });
  });
});

// Little-endian TIFF whose only IFD names itself as the next IFD.
function loopingTiff() {
  const view = tiffHeader(14);
  view.setUint16(8, 0, true);
  view.setUint32(10, 8, true);
  return view.buffer;
}

function oversizedCountTiff() {
  const view = tiffHeader(26);
  view.setUint16(8, 1, true);
  writeEntry(view, 10, { tag: 256, type: 4, count: 2_000_000, value: 8 });
  view.setUint32(22, 0, true);
  return view.buffer;
}

function loopingSubIfdTiff() {
  const view = tiffHeader(26);
  view.setUint16(8, 1, true);
  writeEntry(view, 10, { tag: 330, type: 4, count: 1, value: 8 });
  view.setUint32(22, 0, true);
  return view.buffer;
}

function tiffHeader(size: number) {
  const view = new DataView(new ArrayBuffer(size));
  view.setUint8(0, 73);
  view.setUint8(1, 73);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  return view;
}

function writeEntry(
  view: DataView,
  offset: number,
  entry: { tag: number; type: number; count: number; value: number },
) {
  view.setUint16(offset, entry.tag, true);
  view.setUint16(offset + 2, entry.type, true);
  view.setUint32(offset + 4, entry.count, true);
  view.setUint32(offset + 8, entry.value, true);
}

function stubCanvas() {
  const drawn: { width: number; height: number; pixels: number[] }[] = [];
  vi.stubGlobal(
    "ImageData",
    class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    },
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return {
          putImageData: (image: ImageData) =>
            drawn.push({
              width: image.width,
              height: image.height,
              pixels: [...image.data],
            }),
        };
      }
      async convertToBlob({ type }: { type: string }) {
        return new Blob([new Uint8Array([137, 80, 78, 71])], { type });
      }
    },
  );
  return drawn;
}
