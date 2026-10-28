import { PNG } from "pngjs";

// Anti-aliasing and font hinting jitter stays well under this per-channel delta,
// so only real pixel changes count toward the difference.
const CHANNEL_TOLERANCE = 8;

/**
 * Share of pixels that differ between two PNG screenshots, from 0 to 1.
 * Screenshots with different dimensions count as fully different.
 */
export function measureScreenshotDifference(
  current: Buffer,
  baseline: Buffer,
): number {
  const currentImage = PNG.sync.read(current);
  const baselineImage = PNG.sync.read(baseline);
  if (
    currentImage.width !== baselineImage.width ||
    currentImage.height !== baselineImage.height
  ) {
    return 1;
  }

  const pixelCount = currentImage.width * currentImage.height;
  if (pixelCount === 0) return 0;

  let differingPixels = 0;
  for (let offset = 0; offset < currentImage.data.length; offset += 4) {
    if (
      Math.abs(currentImage.data[offset] - baselineImage.data[offset]) >
        CHANNEL_TOLERANCE ||
      Math.abs(currentImage.data[offset + 1] - baselineImage.data[offset + 1]) >
        CHANNEL_TOLERANCE ||
      Math.abs(currentImage.data[offset + 2] - baselineImage.data[offset + 2]) >
        CHANNEL_TOLERANCE ||
      Math.abs(currentImage.data[offset + 3] - baselineImage.data[offset + 3]) >
        CHANNEL_TOLERANCE
    ) {
      differingPixels += 1;
    }
  }
  return differingPixels / pixelCount;
}
