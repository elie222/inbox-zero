import { describe, expect, it } from "vitest";
import { validateRuleWasReadRecently } from "./shared";

const RULE_NAME = "Vendor Billing";
const RULE_UPDATED_AT = new Date("2026-04-27T00:00:00.000Z");

function readState({
  ageMs = 0,
  rulesRevision = 3,
  ruleUpdatedAt = RULE_UPDATED_AT.toISOString(),
}: {
  ageMs?: number;
  rulesRevision?: number;
  ruleUpdatedAt?: string | null;
} = {}) {
  return () => ({
    readAt: Date.now() - ageMs,
    rulesRevision,
    ruleUpdatedAtByName: new Map(
      ruleUpdatedAt ? [[RULE_NAME, ruleUpdatedAt]] : [],
    ),
  });
}

describe("validateRuleWasReadRecently", () => {
  // The old wall-clock window was shorter than the agent's own tool budget, so
  // a turn that spent a few minutes searching before writing had its write
  // rejected -- invisibly, because the rejection is hidden from the user.
  // Revision and per-rule updatedAt are strictly more precise signals.
  it("accepts a read that is old but still matches current rule state", () => {
    expect(
      validateRuleWasReadRecently({
        ruleName: RULE_NAME,
        getRuleReadState: readState({ ageMs: 10 * 60 * 1000 }),
        currentRulesRevision: 3,
        currentRuleUpdatedAt: RULE_UPDATED_AT,
      }),
    ).toBeNull();
  });

  it("rejects when the account's rules revision moved", () => {
    expect(
      validateRuleWasReadRecently({
        ruleName: RULE_NAME,
        getRuleReadState: readState(),
        currentRulesRevision: 4,
        currentRuleUpdatedAt: RULE_UPDATED_AT,
      }),
    ).toContain("No rule was changed");
  });

  it("rejects when this rule changed since the read", () => {
    expect(
      validateRuleWasReadRecently({
        ruleName: RULE_NAME,
        getRuleReadState: readState(),
        currentRulesRevision: 3,
        currentRuleUpdatedAt: new Date("2026-04-28T00:00:00.000Z"),
      }),
    ).toContain("No rule was changed");
  });

  it("rejects when the rule was never read", () => {
    expect(
      validateRuleWasReadRecently({
        ruleName: RULE_NAME,
        getRuleReadState: readState({ ruleUpdatedAt: null }),
        currentRulesRevision: 3,
        currentRuleUpdatedAt: RULE_UPDATED_AT,
      }),
    ).toContain("No rule was changed");
  });

  it("rejects when no rules have been read at all", () => {
    expect(
      validateRuleWasReadRecently({
        ruleName: RULE_NAME,
        getRuleReadState: () => null,
      }),
    ).toContain("No rule was changed");
  });
});
