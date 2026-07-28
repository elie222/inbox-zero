// Phone cameras produce 4-6MB JPEGs, well past what's useful for reading a
// business card and past the action's size cap. Downscaling in the browser
// keeps the upload small and the text legible.
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

export async function readImageAsDownscaledDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser");
    context.drawImage(bitmap, 0, 0, width, height);

    // JPEG regardless of input, so HEIC from an iPhone arrives as something
    // the model accepts
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
