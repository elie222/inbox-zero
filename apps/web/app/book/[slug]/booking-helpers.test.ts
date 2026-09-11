import { describe, expect, it } from "vitest";
import {
  getInitialVisibleMonthDate,
  normalizeTimezone,
  formatSelectedDateHeading,
} from "./booking-helpers";

describe("formatSelectedDateHeading", () => {
  it("renders the date the guest picked", () => {
    // A previous version took a timezone arg and constructed
    // `${key}T12:00:00Z`, which made far-east zones (UTC+14) roll into the
    // next local day. The key already encodes the chosen calendar date, so
    // the rendering is timezone-independent.
    expect(formatSelectedDateHeading("2026-05-04")).toBe("Mon, May 4");
    expect(formatSelectedDateHeading("2026-12-31")).toBe("Thu, Dec 31");
  });
});

describe("normalizeTimezone", () => {
  it("falls back for invalid timezone query values", () => {
    expect(normalizeTimezone("Not/AZone", "UTC")).toBe("UTC");
    expect(normalizeTimezone("America/New_York", "UTC")).toBe(
      "America/New_York",
    );
  });
});

describe("getInitialVisibleMonthDate", () => {
  it("ignores invalid slot query values", () => {
    expect(
      getInitialVisibleMonthDate(
        "not-a-date",
        new Date("2026-05-15T12:00:00.000Z"),
      ),
    ).toEqual(new Date(2026, 4, 1));
  });

  it("uses the selected slot month when the slot query is valid", () => {
    expect(
      getInitialVisibleMonthDate(
        "2026-07-12T09:00:00.000Z",
        new Date("2026-05-15T12:00:00.000Z"),
      ),
    ).toEqual(new Date(2026, 6, 1));
  });
});
