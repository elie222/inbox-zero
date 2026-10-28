import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { measureScreenshotDifference } from "./playwright-screenshot-diff";

describe("measureScreenshotDifference", () => {
  it("returns 0 for identical images and ignores sub-threshold noise", () => {
    const image = solidImage(10, 10, [40, 42, 45, 255]);
    const noisy = solidImage(10, 10, [44, 38, 49, 255]);

    expect(measureScreenshotDifference(image, image)).toBe(0);
    expect(measureScreenshotDifference(image, noisy)).toBe(0);
  });

  it("returns the share of pixels that changed", () => {
    const baseline = solidImage(10, 10, [255, 255, 255, 255]);
    const current = solidImage(10, 10, [255, 255, 255, 255], (_x, y) =>
      y < 4 ? [38, 40, 44, 255] : undefined,
    );

    expect(measureScreenshotDifference(current, baseline)).toBeCloseTo(0.4);
  });

  it("treats a size change as fully different", () => {
    expect(
      measureScreenshotDifference(
        solidImage(10, 10, [0, 0, 0, 255]),
        solidImage(10, 12, [0, 0, 0, 255]),
      ),
    ).toBe(1);
  });
});

function solidImage(
  width: number,
  height: number,
  color: [number, number, number, number],
  override?: (
    x: number,
    y: number,
  ) => [number, number, number, number] | undefined,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const pixel = override?.(x, y) ?? color;
      png.data[offset] = pixel[0];
      png.data[offset + 1] = pixel[1];
      png.data[offset + 2] = pixel[2];
      png.data[offset + 3] = pixel[3];
    }
  }
  return PNG.sync.write(png);
}
