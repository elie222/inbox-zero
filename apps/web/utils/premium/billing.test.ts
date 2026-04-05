import { describe, expect, it } from "vitest";
import { calculatePremiumBillingQuantity } from "./billing";

describe("calculatePremiumBillingQuantity", () => {
  it("returns zero when no premium users are attached", () => {
    expect(calculatePremiumBillingQuantity({ users: [] })).toBe(0);
  });

  it("charges one full seat per shared premium user", () => {
    expect(
      calculatePremiumBillingQuantity({
        users: [
          { emailAccountCount: 1 },
          { emailAccountCount: 1 },
          { emailAccountCount: 1 },
        ],
      }),
    ).toBe(3);
  });

  it("defaults to legacy billing when no plan allowance is provided", () => {
    expect(
      calculatePremiumBillingQuantity({
        users: [{ emailAccountCount: 2 }],
      }),
    ).toBe(2);
  });

  it("includes extra email accounts when the plan allows it", () => {
    expect(
      calculatePremiumBillingQuantity({
        users: [{ emailAccountCount: 2 }],
        includedEmailAccountsPerUser: 2,
      }),
    ).toBe(1);
  });

  it("charges another seat once a user exceeds the plan allowance", () => {
    expect(
      calculatePremiumBillingQuantity({
        users: [{ emailAccountCount: 3 }],
        includedEmailAccountsPerUser: 2,
      }),
    ).toBe(2);
  });

  it("still charges full price when accounts are split across users", () => {
    expect(
      calculatePremiumBillingQuantity({
        users: [{ emailAccountCount: 1 }, { emailAccountCount: 1 }],
        includedEmailAccountsPerUser: 2,
      }),
    ).toBe(2);
  });

  it("keeps each shared user billable even before they connect an account", () => {
    expect(
      calculatePremiumBillingQuantity({
        users: [{ emailAccountCount: 0 }, { emailAccountCount: 1 }],
      }),
    ).toBe(2);
  });
});
