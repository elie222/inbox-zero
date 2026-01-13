import { describe, it, expect } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { getRuleConfig } from "@/utils/rule/consts";
import type { RuleWithActions } from "@/utils/types";

function getCustomizedRules(conversationRules: RuleWithActions[]) {
  return conversationRules.filter((r) => {
    if (!r.enabled || !r.instructions || !r.systemType) return false;
    const defaultInstructions = getRuleConfig(r.systemType).instructions;
    return r.instructions !== defaultInstructions;
  });
}

function createMockRule(
  systemType: SystemType,
  instructions: string | null,
  enabled = true,
): RuleWithActions {
  return {
    id: `rule-${systemType}`,
    name: systemType,
    instructions,
    enabled,
    systemType,
    runOnThreads: true,
    automate: true,
    actions: [],
    conditions: [],
    conditionalOperator: "AND",
  } as unknown as RuleWithActions;
}

describe("getCustomizedRules", () => {
  it("excludes rules with current default instructions", () => {
    const rules = [
      createMockRule(SystemType.TO_REPLY, "Emails I need to respond to"),
      createMockRule(
        SystemType.FYI,
        "Important emails I should know about, but don't need to reply to",
      ),
      createMockRule(
        SystemType.AWAITING_REPLY,
        "Emails where I'm waiting for someone to get back to me",
      ),
      createMockRule(
        SystemType.ACTIONED,
        "Conversations that are done, nothing left to do",
      ),
    ];

    const customized = getCustomizedRules(rules);
    expect(customized).toHaveLength(0);
  });

  it("includes rules with genuinely customized instructions", () => {
    const rules = [
      createMockRule(SystemType.TO_REPLY, "Emails I need to respond to"),
      createMockRule(
        SystemType.FYI,
        "Important emails from my team that I should read",
      ),
      createMockRule(
        SystemType.AWAITING_REPLY,
        "Emails where I'm waiting for someone to get back to me",
      ),
    ];

    const customized = getCustomizedRules(rules);
    expect(customized).toHaveLength(1);
    expect(customized[0].systemType).toBe(SystemType.FYI);
  });

  it("excludes disabled rules even if customized", () => {
    const rules = [
      createMockRule(
        SystemType.TO_REPLY,
        "Custom to reply instructions",
        false,
      ),
    ];

    const customized = getCustomizedRules(rules);
    expect(customized).toHaveLength(0);
  });

  it("excludes rules with null or empty instructions", () => {
    const rules = [
      createMockRule(SystemType.TO_REPLY, null),
      createMockRule(SystemType.FYI, ""),
    ];

    const customized = getCustomizedRules(rules);
    expect(customized).toHaveLength(0);
  });
});
