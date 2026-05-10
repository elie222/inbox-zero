import { describe, expect, it } from "vitest";
import { formatSelectedDateHeading } from "./booking-helpers";

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
