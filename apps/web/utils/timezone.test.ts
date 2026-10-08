import { describe, expect, it } from "vitest";
import {
  getSupportedTimezonesWithOffsets,
  getTimezoneOffsetMinutes,
} from "@/utils/timezone";

describe("getTimezoneOffsetMinutes", () => {
  it("computes offsets from formatted timezone parts", () => {
    const instant = new Date("2026-07-01T12:00:00.000Z");

    expect(getTimezoneOffsetMinutes("UTC", instant)).toBe(0);
    expect(getTimezoneOffsetMinutes("Asia/Tokyo", instant)).toBe(9 * 60);
    expect(getTimezoneOffsetMinutes("America/New_York", instant)).toBe(-4 * 60);
  });
});

describe("getSupportedTimezonesWithOffsets", () => {
  it("always includes UTC and labels zones by city and generic name", () => {
    const timezones = getSupportedTimezonesWithOffsets();

    expect(timezones.some((tz) => tz.zone === "UTC")).toBe(true);
    expect(
      timezones.find((tz) => tz.zone === "America/New_York"),
    ).toMatchObject({ city: "New York", genericName: "Eastern Time" });
  });

  it("includes a saved timezone missing from the runtime list", () => {
    const timezones = getSupportedTimezonesWithOffsets("US/Eastern");

    expect(timezones.find((tz) => tz.zone === "US/Eastern")).toMatchObject({
      city: "Eastern",
      genericName: "Eastern Time",
    });
  });
});
