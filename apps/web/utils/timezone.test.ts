import { describe, expect, it } from "vitest";
import { getTimezoneOffsetMinutes } from "@/utils/timezone";

describe("getTimezoneOffsetMinutes", () => {
  it("computes offsets from formatted timezone parts", () => {
    const instant = new Date("2026-07-01T12:00:00.000Z");

    expect(getTimezoneOffsetMinutes("UTC", instant)).toBe(0);
    expect(getTimezoneOffsetMinutes("Asia/Tokyo", instant)).toBe(9 * 60);
    expect(getTimezoneOffsetMinutes("America/New_York", instant)).toBe(-4 * 60);
  });
});
