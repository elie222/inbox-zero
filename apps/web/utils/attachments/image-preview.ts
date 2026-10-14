import type { IFD } from "utif2";

const rasterTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/tiff",
]);

type DecodeWithOptions = (
  buffer: ArrayBuffer,
  options: { parseMN: boolean; debug: boolean },
) => IFD[];

// Bounds the RGBA buffer a sender can make us allocate (~100 MB).
const MAX_TIFF_PIXELS = 25_000_000;
// Byte size per TIFF field type, indexed by type id (1-13).
const TIFF_TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
// Tags utif2 decodes into a flat array of sub-IFD offsets.
const TIFF_SUB_IFD_TAGS = new Set([330, 34_665, 34_853]);
// DNG and Fuji maker IFDs, which utif2 follows through raw byte payloads.
const TIFF_UNSUPPORTED_TAGS = new Set([50_740, 61_440]);

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
    if (!hasBoundedTiffStructure(new DataView(buffer))) return;
    // Maker notes are vendor IFDs (Nikon's are re-parsed with decode) that the
    // structure check does not walk. utif2's types omit this option.
    const [image] = (decode as DecodeWithOptions)(buffer, {
      parseMN: false,
      debug: false,
    });
    const width = Number((image?.t256 as number[] | undefined)?.[0]);
    const height = Number((image?.t257 as number[] | undefined)?.[0]);
    if (!width || !height || width * height > MAX_TIFF_PIXELS) return;

    decodeImage(buffer, image);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(toRGBA8(image)), width, height),
      0,
      0,
    );
    return await canvas.convertToBlob({ type: "image/png" });
  } catch {
    return;
  }
}

// utif2 walks IFD chains without a visited set and allocates one value per
// declared tag count, synchronously, before any pixel check. Walk the same
// structure first, rejecting cycles and charging every IFD, entry and value
// against the file size, so decode cannot loop or allocate beyond the input.
function hasBoundedTiffStructure(view: DataView) {
  const littleEndian = view.getUint8(0) === 73;
  const length = view.byteLength;
  const readUint16 = (offset: number) => view.getUint16(offset, littleEndian);
  const readUint32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (length < 8) return false;

  let budget = length;
  const visited = new Set<number>();
  const pending: { offset: number; followNext: boolean }[] = [
    { offset: readUint32(4), followNext: true },
  ];

  while (pending.length) {
    const { offset, followNext } = pending.pop()!;
    if (offset === 0 || visited.has(offset) || offset + 2 > length) {
      return false;
    }
    visited.add(offset);
    const count = readUint16(offset);
    const end = offset + 2 + count * 12;
    if (end + 4 > length) return false;
    budget -= 1 + count;
    if (budget < 0) return false;

    for (let entry = offset + 2; entry < end; entry += 12) {
      const tag = readUint16(entry);
      const type = readUint16(entry + 2);
      const valueCount = readUint32(entry + 4);
      const size = TIFF_TYPE_SIZES[type];
      if (!size || TIFF_UNSUPPORTED_TAGS.has(tag)) return false;

      const valueOffset =
        valueCount * size > 4 ? readUint32(entry + 8) : entry + 8;
      if (valueOffset + valueCount * size > length) return false;
      // Byte payloads are wrapped as views rather than copied.
      if (type !== 1 && type !== 7) budget -= valueCount;
      if (budget < 0) return false;

      if (TIFF_SUB_IFD_TAGS.has(tag)) {
        if (type !== 4 && type !== 13) return false;
        for (let index = 0; index < valueCount; index++) {
          pending.push({
            offset: readUint32(valueOffset + index * 4),
            followNext: false,
          });
        }
      }
    }

    const next = readUint32(end);
    if (followNext && next !== 0) pending.push({ offset: next, followNext });
  }
  return true;
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";", 1)[0].trim().toLowerCase();
}

function matches(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}
