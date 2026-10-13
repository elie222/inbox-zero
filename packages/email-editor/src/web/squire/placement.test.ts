import { describe, expect, it } from "vitest";
import { placePopover } from "./placement";

const bounds = { bottom: 600, left: 0, right: 800, top: 0 };
const size = { height: 100, width: 200 };

describe("placePopover", () => {
  it("opens below the anchor when it fits", () => {
    expect(
      placePopover({
        align: "start",
        anchor: { bottom: 120, left: 300, right: 360, top: 100 },
        bounds,
        size,
      }),
    ).toEqual({ left: 300, top: 128 });
  });

  it("flips above the anchor near the bottom edge", () => {
    expect(
      placePopover({
        align: "center",
        anchor: { bottom: 560, left: 300, right: 400, top: 540 },
        bounds,
        size,
      }),
    ).toEqual({ left: 250, top: 432 });
  });

  it("stays inside the horizontal bounds", () => {
    expect(
      placePopover({
        align: "start",
        anchor: { bottom: 120, left: 750, right: 790, top: 100 },
        bounds,
        size,
      }).left,
    ).toBe(592);
  });
});
