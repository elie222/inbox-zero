import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GroupItemType,
  LogicalOperator,
  SystemType,
} from "@/generated/prisma/enums";
import type { GroupItem, Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";
import { ConditionType } from "@/utils/config";
import {
  getColdEmailRule,
  isColdEmailRuleEnabled,
} from "@/utils/cold-email/cold-email-rule";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import { evaluateRuleConditions, findMatchingRules } from "./match-rules";
import { matchesStaticRule } from "./match-static-conditions";
import {
  getHeaders,
  getMessage,
  getProvider,
  getRule,
} from "./match-rules-test-utils";

const logger = createTestLogger();

const provider = getProvider();

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi.fn(),
}));
vi.mock("@/utils/reply-tracker/check-sender-reply-history", () => ({
  checkSenderReplyHistory: vi.fn(),
}));
vi.mock("@/utils/cold-email/cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
  isColdEmailRuleEnabled: vi.fn(),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  isColdEmail: vi.fn(),
}));

describe("findMatchingRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches a static rule", async () => {
    const rule = getRule({ from: "test@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();
    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0].rule.id).toBe(rule.id);
    expect(result.matches[0].matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("skips a rule that excludes known contacts when the sender is a contact", async () => {
    const rule = getRule({
      name: "GM Responses",
      from: "test@example.com",
      excludeKnownContacts: true,
    });
    prisma.contact.findUnique.mockResolvedValue({ id: "contact-1" } as any);

    const result = await findMatchingRules({
      rules: [rule],
      message: getMessage({
        headers: getHeaders({ from: "test@example.com" }),
      }),
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toHaveLength(0);
    // The skip must be visible: it's otherwise indistinguishable from the
    // rule never existing
    expect(result.selectionMetadata.knownContactSkippedRuleNames).toEqual([
      "GM Responses",
    ]);
  });

  it("names rules dropped because their static conditions failed, with the failing condition", async () => {
    const rule = getRule({
      name: "GM Responses",
      conditionalOperator: LogicalOperator.AND,
      from: "@nucar.com",
      instructions: "Replies to daily reports",
    });

    const result = await findMatchingRules({
      rules: [rule],
      message: getMessage({
        headers: getHeaders({ from: "other@elsewhere.com" }),
      }),
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toHaveLength(0);
    expect(result.selectionMetadata.staticFailedRuleNames).toEqual([
      "GM Responses (requires From: @nucar.com)",
    ]);
  });

  it("only names the conditions that actually failed", async () => {
    const rule = getRule({
      name: "GM Responses",
      conditionalOperator: LogicalOperator.AND,
      from: "@nucar.com",
      subject: "Daily Report",
      instructions: "Replies to daily reports",
    });

    // Sender matches, subject doesn't — the report should blame the subject
    const result = await findMatchingRules({
      rules: [rule],
      message: getMessage({
        headers: getHeaders({
          from: "shawn@nucar.com",
          subject: "Totally different topic",
        }),
      }),
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toHaveLength(0);
    expect(result.selectionMetadata.staticFailedRuleNames).toEqual([
      'GM Responses (requires Subject contains: "Daily Report")',
    ]);
  });

  it("matches normally when the exclude-contacts rule sender is not a contact", async () => {
    const rule = getRule({
      from: "test@example.com",
      excludeKnownContacts: true,
    });
    prisma.contact.findUnique.mockResolvedValue(null);

    const result = await findMatchingRules({
      rules: [rule],
      message: getMessage({
        headers: getHeaders({ from: "test@example.com" }),
      }),
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
  });

  it("matches a static domain", async () => {
    const rule = getRule({ from: "@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0].rule.id).toBe(rule.id);
    expect(result.matches[0].matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("doens't match wrong static domain", async () => {
    const rule = getRule({ from: "@example2.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toHaveLength(0);
    expect(result.reasoning).toBe("");
  });

  it("matches a group rule", async () => {
    const rule = getRule({ groupId: "group1" });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toBe(
      `Matched learned pattern: "FROM: test@example.com"`,
    );
  });

  // A learned pattern stands in for the AI clause only — under AND it must
  // not bypass the static conditions the user set (a learned "FROM: x"
  // routing every email from x regardless of the required subject)
  it("does NOT let a learned pattern bypass static conditions under AND", async () => {
    const rule = getRule({
      groupId: "group1",
      subject: "Daily Report",
      conditionalOperator: LogicalOperator.AND,
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const message = getMessage({
      headers: getHeaders({
        from: "test@example.com",
        subject: "Totally different topic",
      }),
    });

    const result = await findMatchingRules({
      rules: [rule],
      message,
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toHaveLength(0);
    // The skip is diagnosable: the static rejection is recorded, not silent
    expect(result.selectionMetadata?.staticFailedRuleNames?.join("")).toContain(
      rule.name,
    );
  });

  it("matches via learned pattern under AND when static conditions also pass", async () => {
    const rule = getRule({
      groupId: "group1",
      subject: "Daily Report",
      conditionalOperator: LogicalOperator.AND,
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const message = getMessage({
      headers: getHeaders({
        from: "test@example.com",
        subject: "RE: Daily Report",
      }),
    });

    const result = await findMatchingRules({
      rules: [rule],
      message,
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toBe(
      `Matched learned pattern: "FROM: test@example.com"`,
    );
  });

  // Under OR the static leg was never required for an AI match, and the
  // pattern stands in for the AI clause — so it matches on its own
  it("lets a learned pattern match under OR even when static conditions fail", async () => {
    const rule = getRule({
      groupId: "group1",
      subject: "Daily Report",
      instructions: "Match daily reports",
      conditionalOperator: LogicalOperator.OR,
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const message = getMessage({
      headers: getHeaders({
        from: "test@example.com",
        subject: "Totally different topic",
      }),
    });

    const result = await findMatchingRules({
      rules: [rule],
      message,
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toBe(
      `Matched learned pattern: "FROM: test@example.com"`,
    );
  });

  it("should NOT match when group doesn't match and no other conditions", async () => {
    const rule = getRule({
      groupId: "correctGroup", // Rule specifically looks for correctGroup
    });

    // Set up groups - message doesn't match the rule's group
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "wrongGroup",
        items: [
          getGroupItem({
            groupId: "wrongGroup",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
      }),
      getGroup({
        id: "correctGroup",
        items: [
          getGroupItem({
            groupId: "correctGroup",
            type: GroupItemType.FROM,
            value: "wrong@example.com",
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }), // Doesn't match correctGroup
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Group didn't match and no other conditions, so rule should NOT match
    expect(result.matches).toHaveLength(0);
  });

  it("should match only when item is in the correct group", async () => {
    const rule = getRule({ groupId: "correctGroup" });

    // Set up two groups with similar items
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "correctGroup",
        items: [
          getGroupItem({
            groupId: "correctGroup",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
        rule,
      }),
      getGroup({
        id: "otherGroup",
        items: [
          getGroupItem({
            groupId: "otherGroup",
            type: GroupItemType.FROM,
            value: "test@example.com", // Same value, different group
          }),
        ],
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toContain("test@example.com");
  });

  it("should handle multiple rules with different group conditions correctly", async () => {
    const rule1 = getRule({ id: "rule1", groupId: "group1" });
    const rule2 = getRule({ id: "rule2", groupId: "group2" });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({
            groupId: "group1",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
        rule: rule1,
      }),
      getGroup({
        id: "group2",
        items: [
          getGroupItem({
            groupId: "group2",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
        rule: rule2,
      }),
    ]);

    const rules = [rule1, rule2];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Should match the first rule only
    expect(result.matches[0]?.rule.id).toBe("rule1");
    expect(result.reasoning).toContain("test@example.com");
  });

  it("should only match rules whose group actually contains the pattern (bug regression test)", async () => {
    // Regression: Ensure rules only match when their specific group pattern matches,
    // not when other unrelated groups have matching patterns
    const ruleA = getRule({
      id: "rule-a",
      name: "Label Acme Emails",
      groupId: "group-a",
    });
    const ruleB = getRule({
      id: "rule-b",
      name: "Label Beta Emails",
      groupId: "group-b",
    });
    const ruleC = getRule({
      id: "rule-c",
      name: "Label Charlie Emails",
      groupId: "group-c",
    });
    const ruleD = getRule({
      id: "rule-d",
      name: "Label Delta Emails",
      groupId: "group-d",
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group-a",
        name: "Label Acme Emails",
        items: [
          getGroupItem({
            groupId: "group-a",
            type: GroupItemType.FROM,
            value: "alerts@acme.com",
          }),
        ],
        rule: ruleA,
      }),
      getGroup({
        id: "group-b",
        name: "Label Beta Emails",
        items: [
          getGroupItem({
            groupId: "group-b",
            type: GroupItemType.FROM,
            value: "notifications@beta.com",
          }),
        ],
        rule: ruleB,
      }),
      getGroup({
        id: "group-c",
        name: "Label Charlie Emails",
        items: [
          getGroupItem({
            groupId: "group-c",
            type: GroupItemType.FROM,
            value: "support@charlie.com",
          }),
        ],
        rule: ruleC,
      }),
      getGroup({
        id: "group-d",
        name: "Label Delta Emails",
        items: [
          getGroupItem({
            groupId: "group-d",
            type: GroupItemType.FROM,
            value: "info@delta.com",
          }),
        ],
        rule: ruleD,
      }),
    ]);

    const rules = [ruleA, ruleB, ruleC, ruleD];
    const message = getMessage({
      headers: getHeaders({ from: "alerts@acme.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.rule.id).toBe("rule-a");
    expect(result.matches[0]?.rule.name).toBe("Label Acme Emails");
    expect(result.reasoning).toContain("alerts@acme.com");

    const matchedRuleIds = result.matches.map((m) => m.rule.id);
    expect(matchedRuleIds).not.toContain("rule-b");
    expect(matchedRuleIds).not.toContain("rule-c");
    expect(matchedRuleIds).not.toContain("rule-d");
  });

  it("should exclude a rule when an exclusion pattern matches", async () => {
    const rule = getRule({
      id: "rule-with-exclusion",
      groupId: "group-with-exclusion",
    });

    // Set up a group with an exclusion pattern
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group-with-exclusion",
        items: [
          getGroupItem({
            groupId: "group-with-exclusion",
            type: GroupItemType.FROM,
            value: "test@example.com",
            exclude: true, // This is an exclusion pattern
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }), // This matches the exclusion pattern
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // The rule should be excluded (not matched)
    expect(result.matches).toHaveLength(0);
    expect(result.reasoning).toBe("");
  });

  it("should match via static condition when group rule doesn't match pattern (OR operator)", async () => {
    const rule = getRule({
      id: "group-with-fallback",
      groupId: "test-group",
      from: "fallback@example.com", // Static condition
      conditionalOperator: LogicalOperator.OR,
    });

    // Group has different pattern
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "test-group",
        items: [
          getGroupItem({
            type: GroupItemType.FROM,
            value: "group@example.com",
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "fallback@example.com" }), // Matches static, not group
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("should match via static when group rule has group miss and static hit (AND operator)", async () => {
    const rule = getRule({
      id: "group-with-and",
      groupId: "test-group",
      from: "test@example.com", // Static condition
      conditionalOperator: LogicalOperator.AND, // Only applies to AI/Static, not groups
    });

    // Group has different pattern
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "test-group",
        items: [
          getGroupItem({
            type: GroupItemType.FROM,
            value: "group@example.com",
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }), // Matches static, not group
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Groups are independent of AND/OR operator - static match should work
    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("should match when group rule with AND operator has both group and static match", async () => {
    const rule = getRule({
      id: "group-with-and-both",
      groupId: "test-group",
      subject: "Important", // Additional static condition
      conditionalOperator: LogicalOperator.AND,
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "test-group",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({
        from: "test@example.com", // Matches group
        subject: "Important update", // Matches static
      }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Should match via learned pattern and short-circuit (not check static)
    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.matches[0]?.matchReasons).toEqual([
      {
        type: ConditionType.LEARNED_PATTERN,
        groupItem: expect.objectContaining({
          type: GroupItemType.FROM,
          value: "test@example.com",
        }),
        group: expect.objectContaining({ id: "test-group" }),
      },
    ]);
  });

  it("should match learned pattern when email has display name format", async () => {
    const rule = getRule({
      id: "rule-with-display-name",
      groupId: "group-with-display-name",
      instructions:
        "This is an AI instruction; should not be used if group matches.",
      conditionalOperator: LogicalOperator.OR,
    });

    // Set up a group with a learned pattern for just the email address
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group-with-display-name",
        items: [
          getGroupItem({
            groupId: "group-with-display-name",
            type: GroupItemType.FROM,
            value: "central@example.com",
          }),
        ],
        rule,
      }),
    ]);
    (aiChooseRule as ReturnType<typeof vi.fn>).mockClear();

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({
        from: "Central Channel <central@example.com>",
        subject: "A benign subject",
      }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Should match despite the display name format, due to the group rule
    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toBe(
      `Matched learned pattern: "FROM: central@example.com"`,
    );
    expect(aiChooseRule).not.toHaveBeenCalled();
  });
});

describe("findMatchingRules - Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect and return cold email when enabled", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(true);
    vi.mocked(isColdEmail).mockResolvedValue({
      isColdEmail: true,
      reason: "ai",
    });
    vi.mocked(prisma.rule.findUniqueOrThrow).mockResolvedValue(coldEmailRule);

    const rules = [coldEmailRule];
    const message = getMessage({
      headers: getHeaders({ from: "coldemailer@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(getColdEmailRule).toHaveBeenCalledWith(emailAccount.id);
    expect(isColdEmailRuleEnabled).toHaveBeenCalledWith(coldEmailRule);
    expect(isColdEmail).toHaveBeenCalledWith({
      email: expect.any(Object),
      emailAccount,
      provider,
      modelType: "default",
      coldEmailRule,
    });

    expect(result.matches[0]?.rule.id).toBe("cold-email-rule");
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.AI },
    ]);
    expect(result.reasoning).toBe("ai");
  });

  it("returns learned pattern match reasons for cold email pattern hits", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });
    const group = { id: "cold-email-group", name: "Cold Email" };
    const groupItem = {
      id: "cold-email-sender",
      type: GroupItemType.FROM,
      value: "coldemailer@example.com",
      exclude: false,
    };

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(true);
    vi.mocked(isColdEmail).mockResolvedValue({
      isColdEmail: true,
      reason: "ai-already-labeled",
      patternMatch: {
        group,
        groupItem,
      },
    });
    vi.mocked(prisma.rule.findUniqueOrThrow).mockResolvedValue(coldEmailRule);

    const result = await findMatchingRules({
      rules: [coldEmailRule],
      message: getMessage({
        headers: getHeaders({ from: "coldemailer@example.com" }),
      }),
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches).toEqual([
      {
        rule: coldEmailRule,
        matchReasons: [
          {
            type: ConditionType.LEARNED_PATTERN,
            group,
            groupItem,
          },
        ],
      },
    ]);
    expect(result.reasoning).toBe("ai-already-labeled");
  });

  it("should skip cold email detection when rule is not enabled", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });

    const normalRule = getRule({
      id: "normal-rule",
      from: "test@example.com",
    });

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(false);

    const rules = [coldEmailRule, normalRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(getColdEmailRule).toHaveBeenCalledWith(emailAccount.id);
    expect(isColdEmailRuleEnabled).toHaveBeenCalledWith(coldEmailRule);
    expect(isColdEmail).not.toHaveBeenCalled();

    // Should match the normal rule instead
    expect(result.matches[0]?.rule.id).toBe("normal-rule");
  });

  it("should continue to other rules when email is not cold", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });

    const normalRule = getRule({
      id: "normal-rule",
      from: "test@example.com",
    });

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(true);
    vi.mocked(isColdEmail).mockResolvedValue({
      isColdEmail: false,
      reason: "hasPreviousEmail",
    });

    const rules = [coldEmailRule, normalRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(isColdEmail).toHaveBeenCalled();

    // Should continue and match the normal rule
    expect(result.matches[0]?.rule.id).toBe("normal-rule");
  });

  it("should match calendar rule when message has .ics attachment", async () => {
    const calendarRule = getRule({
      id: "calendar-rule",
      systemType: SystemType.CALENDAR,
    });

    const rules = [calendarRule];
    const message = getMessage({
      headers: getHeaders(),
      attachments: [
        {
          filename: "meeting.ics",
          mimeType: "text/calendar",
          size: 1024,
          attachmentId: "attachment-1",
          headers: {
            "content-type": "text/calendar",
            "content-description": "",
            "content-transfer-encoding": "",
            "content-id": "",
          },
        },
      ],
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe("calendar-rule");
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.PRESET, systemType: SystemType.CALENDAR },
    ]);
  });

  it("should execute AI rules when potentialAiMatches exist", async () => {
    const aiRule = getRule({
      id: "ai-rule",
      instructions: "Archive promotional emails",
      from: null,
      to: null,
      subject: null,
      body: null,
    });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: aiRule as any }],
      reason: "This is a promotional email",
    });

    const rules = [aiRule];
    const message = getMessage();
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(aiChooseRule).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.any(Object),
        emailAccount,
        modelType: "default",
        rules: expect.arrayContaining([
          expect.objectContaining({
            id: "ai-rule",
            instructions: "Archive promotional emails",
          }),
        ]),
      }),
    );

    expect(result.matches[0]?.rule.id).toBe("ai-rule");
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.AI },
    ]);
    expect(result.reasoning).toBe("This is a promotional email");
  });

  it("records static + AI match reasons when an AND rule is AI-confirmed", async () => {
    const andRule = getRule({
      id: "and-rule",
      from: "@example.com",
      instructions: "Replies to daily report emails",
      conditionalOperator: LogicalOperator.AND,
    });

    // Return the pooled rule the engine passed in, as the real AI does
    vi.mocked(aiChooseRule).mockImplementation(async ({ rules }) => ({
      rules: [{ rule: rules[0], isPrimary: true }],
      reason: "Content matches",
    }));

    const result = await findMatchingRules({
      rules: [andRule],
      message: getMessage({
        headers: getHeaders({ from: "shawn@example.com" }),
      }),
      emailAccount: getEmailAccount(),
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches[0]?.rule.id).toBe("and-rule");
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.STATIC },
      { type: ConditionType.AI },
    ]);
  });

  it("flags pooled rules that previously filed this thread", async () => {
    const aiRule = getRule({
      id: "thread-continuity-rule",
      instructions: "Replies to daily report emails",
      runOnThreads: true,
    });

    const threadProvider = getProvider({ isThread: true });
    prisma.executedRule.findMany.mockResolvedValue([
      { ruleId: "thread-continuity-rule" },
    ] as any);
    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [],
      reason: "no match",
    });

    await findMatchingRules({
      rules: [aiRule],
      message: getMessage({
        headers: getHeaders({ from: "shawn@example.com" }),
      }),
      emailAccount: getEmailAccount(),
      provider: threadProvider,
      modelType: "default",
      logger,
    });

    expect(aiChooseRule).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            id: "thread-continuity-rule",
            previouslyMatchedThread: true,
          }),
        ],
      }),
    );
  });

  it("should prioritize learned patterns over AI rules", async () => {
    const learnedPatternRule = getRule({
      id: "learned-rule",
      groupId: "group1",
    });

    const aiRule = getRule({
      id: "ai-rule",
      instructions: "Some AI instructions",
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule: learnedPatternRule,
      }),
    ]);

    const rules = [learnedPatternRule, aiRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Should match via learned pattern
    expect(result.matches[0]?.rule.id).toBe("learned-rule");
    expect(result.matches[0]?.matchReasons?.[0]?.type).toBe(
      ConditionType.LEARNED_PATTERN,
    );

    // AI should NOT be called because learned pattern matched
    expect(aiChooseRule).not.toHaveBeenCalled();
  });

  it("should skip rules with runOnThreads=false when message is a thread", async () => {
    const threadRule = getRule({
      id: "thread-rule",
      from: "test@example.com",
      runOnThreads: false,
    });

    const threadProvider = getProvider({ isThread: true });

    // Mock no previously executed rules in thread
    prisma.executedRule.findMany.mockResolvedValue([]);

    const rules = [threadRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider: threadProvider,
      modelType: "default",
      logger,
    });

    // Rule should not match because it's a thread and runOnThreads=false
    expect(result.matches).toHaveLength(0);
    expect(result.selectionMetadata).toMatchObject({
      isThread: true,
      skippedThreadRuleNames: ["Rule Name"],
    });
  });

  describe("Learned patterns and runOnThreads interaction", () => {
    it("should skip learned pattern match when runOnThreads=false and rule not previously applied", async () => {
      const marketingRule = getRule({
        id: "marketing-rule",
        groupId: "marketing-group",
        runOnThreads: false,
        instructions: "Marketing: Promotional emails",
      });

      prisma.group.findMany.mockResolvedValue([
        getGroup({
          id: "marketing-group",
          items: [
            getGroupItem({
              type: GroupItemType.FROM,
              value: "sender@example.com",
            }),
          ],
          rule: marketingRule,
        }),
      ]);

      // No previously executed rules in this thread
      prisma.executedRule.findMany.mockResolvedValue([]);

      const threadProvider = getProvider({ isThread: true });

      const rules = [marketingRule];
      const message = getMessage({
        headers: getHeaders({ from: "sender@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      // Should NOT match: runOnThreads=false, rule never applied to this thread
      expect(result.matches).toHaveLength(0);
    });

    it("should allow learned pattern match in thread when rule was previously applied (thread continuity)", async () => {
      const notifRule = getRule({
        id: "notif-rule",
        groupId: "notif-group",
        runOnThreads: false,
      });

      prisma.group.findMany.mockResolvedValue([
        getGroup({
          id: "notif-group",
          items: [
            getGroupItem({
              type: GroupItemType.FROM,
              value: "alerts@service.com",
            }),
          ],
          rule: notifRule,
        }),
      ]);

      // Rule WAS previously applied to this thread
      prisma.executedRule.findMany.mockResolvedValue([
        { ruleId: "notif-rule" },
      ] as any);

      const threadProvider = getProvider({ isThread: true });

      const rules = [notifRule];
      const message = getMessage({
        headers: getHeaders({ from: "alerts@service.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      // Should match: thread continuity allows the rule, and learned pattern confirms it
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("notif-rule");
      expect(result.matches[0]?.matchReasons?.[0]?.type).toBe(
        ConditionType.LEARNED_PATTERN,
      );
    });

    it("should allow learned pattern match on first message in thread (not a reply)", async () => {
      const marketingRule = getRule({
        id: "marketing-rule",
        groupId: "marketing-group",
        runOnThreads: false,
      });

      prisma.group.findMany.mockResolvedValue([
        getGroup({
          id: "marketing-group",
          items: [
            getGroupItem({
              type: GroupItemType.FROM,
              value: "promo@store.com",
            }),
          ],
          rule: marketingRule,
        }),
      ]);

      const nonThreadProvider = getProvider();

      const rules = [marketingRule];
      const message = getMessage({
        headers: getHeaders({ from: "promo@store.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: nonThreadProvider,
        modelType: "default",
        logger,
      });

      // Should match: first message, runOnThreads check doesn't fire
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("marketing-rule");
      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
    });

    it("captures learned-pattern exclusions in selection metadata", async () => {
      const notificationRule = getRule({
        id: "notification-rule",
        name: "Notification",
        groupId: "notification-group",
        runOnThreads: false,
        systemType: SystemType.NOTIFICATION,
        instructions: "Notifications and system messages",
      });

      prisma.group.findMany.mockResolvedValue([
        getGroup({
          id: "notification-group",
          name: "Notification",
          items: [
            getGroupItem({
              groupId: "notification-group",
              type: GroupItemType.FROM,
              value: "updates@example.com",
              exclude: true,
            }),
          ],
          rule: notificationRule,
        }),
      ]);

      const providerNoThread = getProvider();

      const result = await findMatchingRules({
        rules: [notificationRule],
        message: getMessage({
          headers: getHeaders({ from: "updates@example.com" }),
        }),
        emailAccount: getEmailAccount(),
        provider: providerNoThread,
        modelType: "default",
        logger,
      });

      expect(result.matches).toHaveLength(0);
      expect(result.selectionMetadata.learnedPatternExcludedRules).toEqual([
        {
          ruleId: "notification-rule",
          ruleName: "Notification",
          groupId: "notification-group",
          groupName: "Notification",
          itemType: GroupItemType.FROM,
          itemValue: "updates@example.com",
        },
      ]);
      expect(result.selectionMetadata.remainingAiRuleNames).toEqual([]);
    });

    it("should allow learned pattern match in thread when runOnThreads=true", async () => {
      const rule = getRule({
        id: "thread-ok-rule",
        groupId: "thread-ok-group",
        runOnThreads: true,
      });

      prisma.group.findMany.mockResolvedValue([
        getGroup({
          id: "thread-ok-group",
          items: [
            getGroupItem({
              type: GroupItemType.FROM,
              value: "team@company.com",
            }),
          ],
          rule,
        }),
      ]);

      const threadProvider = getProvider({ isThread: true });

      const rules = [rule];
      const message = getMessage({
        headers: getHeaders({ from: "team@company.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      // Should match: runOnThreads=true, no restriction
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("thread-ok-rule");
      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
    });

    it("should skip AI match on thread when runOnThreads=false and rule not previously applied", async () => {
      const marketingRule = getRule({
        id: "marketing-ai-rule",
        runOnThreads: false,
        instructions: "Marketing: Promotional emails",
      });

      prisma.executedRule.findMany.mockResolvedValue([]);

      const threadProvider = getProvider({ isThread: true });

      const rules = [marketingRule];
      const message = getMessage({
        headers: getHeaders({ from: "someone@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      // Should NOT match and AI should not be called
      expect(result.matches).toHaveLength(0);
      expect(aiChooseRule).not.toHaveBeenCalled();
      expect(result.selectionMetadata).toMatchObject({
        isThread: true,
        skippedThreadRuleNames: ["Rule Name"],
      });
    });
  });

  describe("Group rules fallthrough when no groups exist", () => {
    it("falls through to static/AI evaluation when getGroupsWithRules returns empty", async () => {
      const groupRule = getRule({
        id: "group-rule-1",
        from: "group@example.com",
        groupId: "g1",
      });

      const providerNoThread = getProvider();

      // Mock groups to be empty so the code path skips learned pattern branch
      const groupModule = await import("@/utils/group/find-matching-group");
      vi.spyOn(groupModule, "getGroupsWithRules").mockResolvedValue([] as any);

      const rules = [groupRule];
      const message = getMessage({
        headers: getHeaders({ from: "group@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: providerNoThread,
        modelType: "default",
        logger,
      });

      // Should match via static evaluation since groups are empty
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("group-rule-1");
    });
  });
  describe("Thread continuity - runOnThreads=false rules", () => {
    it("should continue applying rule in a thread when it was previously applied", async () => {
      const notifRule = getRule({
        id: "notif-rule",
        from: "notif@example.com",
        runOnThreads: false,
      });

      const threadProvider = getProvider({ isThread: true });

      // Mock DB to return previously executed rule id
      prisma.executedRule.findMany.mockResolvedValue([
        { ruleId: "notif-rule" },
      ] as any);

      const rules = [notifRule];
      const message = getMessage({
        headers: getHeaders({ from: "notif@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(1);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("notif-rule");
    });

    it("should lazy-load previous rules only once for multiple runOnThreads=false rules", async () => {
      const ruleA = getRule({
        id: "rule-a",
        from: "multi@example.com",
        runOnThreads: false,
      });
      const ruleB = getRule({
        id: "rule-b",
        from: "multi@example.com",
        runOnThreads: false,
      });

      const threadProvider = getProvider({ isThread: true });

      prisma.executedRule.findMany.mockResolvedValue([
        { ruleId: "rule-a" },
        { ruleId: "rule-b" },
      ] as any);

      const rules = [ruleA, ruleB];
      const message = getMessage({
        headers: getHeaders({ from: "multi@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(1);
      expect(result.matches.map((m) => m.rule.id).sort()).toEqual([
        "rule-a",
        "rule-b",
      ]);
    });

    it("should not query DB when message is not a thread", async () => {
      const notifRule = getRule({
        id: "not-thread",
        from: "no-thread@example.com",
        runOnThreads: false,
      });

      const providerNotThread = getProvider();

      const rules = [notifRule];
      const message = getMessage({
        headers: getHeaders({ from: "no-thread@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: providerNotThread,
        modelType: "default",
        logger,
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      // Not a thread, so normal matching applies (matches by static from)
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("not-thread");
    });

    it("should not query DB when rule has runOnThreads=true (even in a thread)", async () => {
      const threadRule = getRule({
        id: "thread-ok",
        from: "yes-thread@example.com",
        runOnThreads: true,
      });

      const threadProvider = getProvider({ isThread: true });

      const rules = [threadRule];
      const message = getMessage({
        headers: getHeaders({ from: "yes-thread@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
        logger,
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("thread-ok");
    });
  });

  it("should handle invalid regex patterns gracefully", () => {
    const rule = getRule({
      from: "[invalid(regex",
    });

    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    // Should not throw, just return false
    expect(() => matchesStaticRule(rule, message, logger)).not.toThrow();
    const result = matchesStaticRule(rule, message, logger);
    expect(result).toBe(false);
  });

  it("should combine static match with AI potentialMatch correctly", async () => {
    const mixedRule = getRule({
      id: "mixed-rule",
      from: "test@example.com",
      instructions: "Archive if promotional",
      conditionalOperator: LogicalOperator.AND,
    });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: mixedRule as any }],
      reason: "Email is promotional",
    });

    const rules = [mixedRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Static matched, so should be sent to AI for AND check
    expect(aiChooseRule).toHaveBeenCalled();
    expect(result.matches[0]?.rule.id).toBe("mixed-rule");
  });

  it("merges static match with AI rule and combines reasoning text", async () => {
    const staticRule = getRule({
      id: "static-rule-1",
      from: "reason@example.com",
    });
    const aiOnlyRule = getRule({ id: "ai-rule-2", instructions: "Do X" });

    // Ensure potentialAiMatches includes aiOnlyRule
    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: aiOnlyRule as any, isPrimary: true }],
      reason: "AI reasoning here",
    });

    const rules = [staticRule, aiOnlyRule];
    const message = getMessage({
      headers: getHeaders({ from: "reason@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    // Reasoning should combine existing matchReasons text + AI reason
    // existing part comes from getMatchReason => "Matched static conditions"
    expect(result.reasoning).toBe(
      "Matched static conditions; AI reasoning here",
    );
  });

  it("matchesStaticRule: catches RegExp construction error and returns false", () => {
    const rule = getRule({ from: "trigger-error" });
    const message = getMessage({
      headers: getHeaders({ from: "any@example.com" }),
    });

    const OriginalRegExp = RegExp;
    // Monkeypatch RegExp to throw for our specific pattern
    // Only for this test; restore afterwards
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).RegExp = ((pattern: string) => {
      if (pattern.includes("trigger-error")) {
        throw new Error("synthetic error");
      }
      // Delegate to original
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new (OriginalRegExp as any)(pattern);
    }) as unknown as RegExpConstructor;

    try {
      const matched = matchesStaticRule(rule as any, message as any, logger);
      expect(matched).toBe(false);
    } finally {
      // restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).RegExp =
        OriginalRegExp as unknown as RegExpConstructor;
    }
  });

  it("AI path: returns only AI reasoning when no static matches and AI returns no rules", async () => {
    const aiOnlyRule = getRule({ id: "ai-only-1", instructions: "Do Y" });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [],
      reason: "AI had reasoning but selected nothing",
    });

    const rules = [aiOnlyRule];
    const message = getMessage({
      // No static matchers
      headers: getHeaders({ from: "nobody@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
      logger,
    });

    expect(result.matches.map((m) => m.rule.id)).toEqual([]);
    expect(result.reasoning).toBe("AI had reasoning but selected nothing");
  });

  it("AI path: dedups AI-selected rule when it duplicates a static match", async () => {
    const dupRule = getRule({
      id: "dup-rule",
      from: "dup@example.com",
      instructions: "Use AI too",
      runOnThreads: true,
    });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: dupRule as any }],
      reason: "AI selects dup-rule",
    });

    const rules = [dupRule];
    const message = getMessage({
      headers: getHeaders({ from: "dup@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const spy = vi.spyOn(provider, "isReplyInThread").mockReturnValue(false);
    try {
      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider,
        modelType: "default",
        logger,
      });

      // Only one occurrence of dup-rule should remain
      const ids = result.matches.map((m) => m.rule.id);
      expect(ids).toEqual(["dup-rule"]);
      expect(result.reasoning).toContain("AI selects dup-rule");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("evaluateRuleConditions", () => {
  it("should match STATIC condition", () => {
    const rule = getRule({ from: "test@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(true);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([{ type: ConditionType.STATIC }]);
  });

  it("should not match when STATIC condition fails", () => {
    const rule = getRule({ from: "test@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
    expect(result.staticFailed).toBe(true);
  });

  it("AND: flags staticFailed when the static leg drops the rule", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      from: "@nucar.com",
      instructions: "Replies to daily reports",
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@elsewhere.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.staticFailed).toBe(true);
  });

  it("OR: does not flag staticFailed when the AI leg keeps the rule in play", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.potentialAiMatch).toBe(true);
    expect(result.staticFailed).toBe(false);
  });

  it("should return potentialAiMatch for AI-only rule", () => {
    const rule = getRule({
      instructions: "Some AI instructions",
      from: null,
      to: null,
      subject: null,
      body: null,
    });
    const message = getMessage();

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(true);
    expect(result.matchReasons).toEqual([]);
  });

  it("OR: should match immediately with STATIC, ignoring AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(true);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([{ type: ConditionType.STATIC }]);
  });

  it("OR: should return potentialAiMatch when STATIC fails but has AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(true);
    expect(result.matchReasons).toEqual([]);
  });

  it("AND: should return potentialAiMatch when STATIC passes and has AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(true);
    expect(result.matchReasons).toEqual([{ type: ConditionType.STATIC }]);
  });

  it("AND: should not match when STATIC fails even with AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });

  it("should NOT match when no conditions are present", () => {
    const rule = getRule({
      from: null,
      to: null,
      subject: null,
      body: null,
      instructions: null,
    });
    const message = getMessage();

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });

  it("OR: should not match when STATIC fails and no AI condition", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: null,
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message, logger });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });
});

function getGroup(
  overrides: Partial<
    Prisma.GroupGetPayload<{ include: { items: true; rule: true } }>
  > = {},
): Prisma.GroupGetPayload<{ include: { items: true; rule: true } }> {
  const {
    id = "group1",
    name = "group",
    createdAt = new Date(),
    updatedAt = new Date(),
    emailAccountId = "emailAccountId",
    prompt = null,
    items = [],
    rule = null,
  } = overrides;

  return {
    id,
    name,
    createdAt,
    updatedAt,
    emailAccountId,
    prompt,
    items,
    rule,
  };
}

function getGroupItem(overrides: Partial<GroupItem> = {}): GroupItem {
  const {
    id = "groupItem1",
    createdAt = new Date(),
    updatedAt = new Date(),
    groupId = "groupId",
    type = GroupItemType.FROM,
    value = "test@example.com",
    exclude = false,
    reason = null,
    threadId = null,
    messageId = null,
    source = null,
  } = overrides;

  return {
    id,
    createdAt,
    updatedAt,
    groupId,
    type,
    value,
    exclude,
    reason,
    threadId,
    messageId,
    source,
  };
}
