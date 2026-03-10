import { describe, expect, it } from "vitest";
import { calculatePremiumBillingQuantity } from "./billing";

describe("calculatePremiumBillingQuantity", () => {
  it("returns zero when no premium users are attached", () => {
    expect(calculatePremiumBillingQuantity([])).toBe(0);
  });

  it("charges one full seat per shared premium user", () => {
    expect(
      calculatePremiumBillingQuantity([
        { emailAccountCount: 1 },
        { emailAccountCount: 1 },
        { emailAccountCount: 1 },
      ]),
    ).toBe(3);
  });

  it("includes a second email account for the same user in the paid seat", () => {
    expect(calculatePremiumBillingQuantity([{ emailAccountCount: 2 }])).toBe(1);
  });

  it("charges another seat once a user exceeds the included account count", () => {
    expect(calculatePremiumBillingQuantity([{ emailAccountCount: 3 }])).toBe(2);
  });

  it("still charges full price when accounts are split across users", () => {
    expect(
      calculatePremiumBillingQuantity([
        { emailAccountCount: 1 },
        { emailAccountCount: 1 },
      ]),
    ).toBe(2);
  });

  it("keeps each shared user billable even before they connect an account", () => {
    expect(
      calculatePremiumBillingQuantity([
        { emailAccountCount: 0 },
        { emailAccountCount: 1 },
      ]),
    ).toBe(2);
  });
});
