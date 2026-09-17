import { describe, expect, it } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { shouldShowSystemRule, sortRulesByCanonicalOrder } from "./sort";

describe("sortRulesByCanonicalOrder", () => {
  it("puts disabled rules after enabled rules and sorts each group by name", () => {
    const rules = [
      { name: "Zulu", enabled: true },
      { name: "Alpha", enabled: false },
      { name: "Bravo", enabled: true },
      { name: "Charlie", enabled: false },
    ];

    expect(sortRulesByCanonicalOrder(rules).map((rule) => rule.name)).toEqual([
      "Bravo",
      "Zulu",
      "Alpha",
      "Charlie",
    ]);
  });

  it("keeps system rules in their canonical order within a status group", () => {
    const rules = [
      {
        name: "Newsletter",
        enabled: true,
        systemType: SystemType.NEWSLETTER,
      },
      {
        name: "OTP",
        enabled: true,
        systemType: SystemType.OTP,
      },
      {
        name: "Cold Email",
        enabled: true,
        systemType: SystemType.COLD_EMAIL,
      },
      { name: "Alpha", enabled: true },
    ];

    expect(sortRulesByCanonicalOrder(rules).map((rule) => rule.name)).toEqual([
      "Newsletter",
      "OTP",
      "Cold Email",
      "Alpha",
    ]);
  });
});

describe("shouldShowSystemRule", () => {
  it("keeps standard system rules on the list even when they are missing or off", () => {
    expect(shouldShowSystemRule(SystemType.NOTIFICATION)).toBe(true);
    expect(
      shouldShowSystemRule(SystemType.NOTIFICATION, { enabled: false }),
    ).toBe(true);
  });

  it("hides opt-in system rules until they are enabled", () => {
    expect(shouldShowSystemRule(SystemType.OTP)).toBe(false);
    expect(shouldShowSystemRule(SystemType.OTP, { enabled: false })).toBe(
      false,
    );
    expect(shouldShowSystemRule(SystemType.OTP, { enabled: true })).toBe(true);
  });
});
