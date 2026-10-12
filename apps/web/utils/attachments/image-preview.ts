const rasterTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/tiff",
]);
// Bounds the RGBA buffer a sender can make us allocate (~100 MB).
const MAX_TIFF_PIXELS = 25_000_000;

export function isPreviewableImageType(mimeType: string) {
  return rasterTypes.has(normalizeMimeType(mimeType));
}

export function isPreviewableAttachment({
  mimeType,
  filename,
}: {
  mimeType: string;
  filename: string;
}) {
  // Senders often label PDFs as octet-stream; the bytes are checked before rendering.
  return (
    isPreviewableImageType(mimeType) ||
    normalizeMimeType(mimeType) === "application/pdf" ||
    filename.toLowerCase().endsWith(".pdf")
  );
}

export async function getAttachmentPreview(
  blob: Blob,
): Promise<Blob | undefined> {
  const image = await getAttachmentImagePreview(blob);
  if (image) return image;
  // PDF readers accept the header anywhere in the first 1024 bytes.
  const header = new TextDecoder("latin1").decode(
    await blob.slice(0, 1024).arrayBuffer(),
  );
  if (header.includes("%PDF-"))
    return blob.slice(0, blob.size, "application/pdf");
}

export async function getAttachmentImagePreview(
  blob: Blob,
): Promise<Blob | undefined> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  let type: string;
  if (matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) {
    type = "image/png";
  } else if (matches(bytes, [255, 216, 255])) {
    type = "image/jpeg";
  } else if (
    matches(bytes, [71, 73, 70, 56, 55, 97]) ||
    matches(bytes, [71, 73, 70, 56, 57, 97])
  ) {
    type = "image/gif";
  } else if (
    matches(bytes, [82, 73, 70, 70]) &&
    matches(bytes.subarray(8), [87, 69, 66, 80, 86, 80, 56])
  ) {
    type = "image/webp";
  } else if (
    matches(bytes, [73, 73, 42, 0]) ||
    matches(bytes, [77, 77, 0, 42])
  ) {
    // Chromium cannot render TIFF, and Apple Mail pastes screenshots as TIFF.
    return convertTiffToPng(blob);
  } else {
    return;
  }
  // HTTP download headers do not constrain a Blob opened as a document.
  // Never carry an untrusted MIME type into a preview, including cached Blobs.
  return blob.slice(0, blob.size, type);
}

async function convertTiffToPng(blob: Blob): Promise<Blob | undefined> {
  try {
    // TIFFs are rare, so the decoder stays out of the mail-view bundle.
    // utif2 is CommonJS; strict ESM exposes it only as the default export.
    const { decode, decodeImage, toRGBA8 } = (await import("utif2")).default;
    const buffer = await blob.arrayBuffer();
    const [image] = decode(buffer);
    const width = Number((image?.t256 as number[] | undefined)?.[0]);
    const height = Number((image?.t257 as number[] | undefined)?.[0]);
    if (!width || !height || width * height > MAX_TIFF_PIXELS) return;

    decodeImage(buffer, image);
    const canvas = new OffscreenCanvas(width, height);
    canvas
      .getContext("2d")
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(toRGBA8(image)), width, height),
        0,
        0,
      );
    return await canvas.convertToBlob({ type: "image/png" });
  } catch {
    return;
  }
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";", 1)[0].trim().toLowerCase();
}

function matches(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}
