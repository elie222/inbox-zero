import { describe, it, expect } from "vitest";
import { isDayProtected } from "./day-protection";

// Verified dates in 2026:
// 2026-03-24 = Tuesday
// 2026-03-25 = Wednesday
// 2026-03-27 = Friday

describe("isDayProtected", () => {
  it("Tuesday is protected and NOT overridable, even for VIPs", () => {
    const tuesday = new Date("2026-03-24T12:00:00");
    const resultNonVip = isDayProtected(tuesday, false);
    expect(resultNonVip.protected).toBe(true);
    expect(resultNonVip.overridable).toBe(false);

    const resultVip = isDayProtected(tuesday, true);
    expect(resultVip.protected).toBe(true);
    expect(resultVip.overridable).toBe(false);
  });

  it("Friday is protected and overridable for non-VIPs", () => {
    const friday = new Date("2026-03-27T12:00:00");
    const result = isDayProtected(friday, false);
    expect(result.protected).toBe(true);
    expect(result.overridable).toBe(true);
  });

  it("Friday is NOT protected for VIPs", () => {
    const friday = new Date("2026-03-27T12:00:00");
    const result = isDayProtected(friday, true);
    expect(result.protected).toBe(false);
  });

  it("Wednesday is NOT protected", () => {
    const wednesday = new Date("2026-03-25T12:00:00");
    const result = isDayProtected(wednesday, false);
    expect(result.protected).toBe(false);
  });
});
