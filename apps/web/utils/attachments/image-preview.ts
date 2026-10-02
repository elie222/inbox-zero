const rasterTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isPreviewableImageType(mimeType: string) {
  return rasterTypes.has(normalizeMimeType(mimeType));
}

export function isPreviewableAttachmentType(mimeType: string) {
  return (
    isPreviewableImageType(mimeType) ||
    normalizeMimeType(mimeType) === "application/pdf"
  );
}

export async function getAttachmentPreview(
  blob: Blob,
): Promise<Blob | undefined> {
  const image = await getAttachmentImagePreview(blob);
  if (image) return image;
  const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (matches(bytes, [37, 80, 68, 70, 45]))
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
  } else {
    return;
  }
  // HTTP download headers do not constrain a Blob opened as a document.
  // Never carry an untrusted MIME type into a preview, including cached Blobs.
  return blob.slice(0, blob.size, type);
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";", 1)[0].trim().toLowerCase();
}

function matches(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}
