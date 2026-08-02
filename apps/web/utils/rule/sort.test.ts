import { describe, expect, it } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { sortRulesByCanonicalOrder } from "./sort";

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
        name: "Cold Email",
        enabled: true,
        systemType: SystemType.COLD_EMAIL,
      },
      { name: "Alpha", enabled: true },
    ];

    expect(sortRulesByCanonicalOrder(rules).map((rule) => rule.name)).toEqual([
      "Newsletter",
      "Cold Email",
      "Alpha",
    ]);
  });
});
