import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureConversationRuleContinuity,
  CONVERSATION_TRACKING_META_RULE_ID,
} from "./run-rules";
import { ExecutedRuleStatus, SystemType } from "@prisma/client";
import { ConditionType } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import type { RuleWithActions } from "@/utils/types";

vi.mock("@/utils/prisma");
vi.mock("server-only", () => ({}));

describe("ensureConversationRuleContinuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const emailAccountId = "account-1";
  const threadId = "thread-1";

  const createRule = (
    id: string,
    systemType: SystemType | null = null,
  ): RuleWithActions => ({
    id,
    name: `Rule ${id}`,
    instructions: `Instructions for ${id}`,
    enabled: true,
    emailAccountId,
    createdAt: new Date(),
    updatedAt: new Date(),
    actions: [],
    runOnThreads: false,
    from: null,
    to: null,
    subject: null,
    body: null,
    groupId: null,
    conditionalOperator: "AND" as const,
    systemType,
    automate: true,
    promptText: null,
    categoryFilterType: null,
  });

  const conversationMetaRule = createRule(CONVERSATION_TRACKING_META_RULE_ID);
  const toReplyRule = createRule("to-reply-rule", SystemType.TO_REPLY);
  const regularRule = createRule("regular-rule");

  it("returns matches unchanged when there are no conversation rules", async () => {
    const matches = [{ rule: regularRule }];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [],
      regularRules: [regularRule],
      matches,
    });

    expect(result).toEqual(matches);
    expect(prisma.executedRule.findFirst).not.toHaveBeenCalled();
  });

  it("returns matches unchanged when no previous conversation rule was applied in thread", async () => {
    prisma.executedRule.findFirst.mockResolvedValue(null);

    const matches = [{ rule: regularRule }];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [toReplyRule],
      regularRules: [regularRule, conversationMetaRule],
      matches,
    });

    expect(result).toEqual(matches);
    expect(prisma.executedRule.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId,
        threadId,
        status: ExecutedRuleStatus.APPLIED,
        rule: {
          systemType: {
            in: expect.arrayContaining([
              SystemType.TO_REPLY,
              SystemType.AWAITING_REPLY,
              SystemType.FYI,
              SystemType.ACTIONED,
            ]),
          },
        },
      },
      select: { id: true },
    });
  });

  it("returns matches unchanged when conversation meta rule is already in matches", async () => {
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "executed-rule-1",
    } as any);

    const matches = [{ rule: conversationMetaRule }, { rule: regularRule }];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [toReplyRule],
      regularRules: [regularRule, conversationMetaRule],
      matches,
    });

    expect(result).toEqual(matches);
  });

  it("adds conversation meta rule when previous conversation rule was applied and meta rule not in matches", async () => {
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "executed-rule-1",
    } as any);

    const matches = [{ rule: regularRule }];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [toReplyRule],
      regularRules: [regularRule, conversationMetaRule],
      matches,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ rule: regularRule });
    expect(result[1]).toEqual({
      rule: conversationMetaRule,
      matchReasons: [{ type: ConditionType.STATIC }],
    });
  });

  it("returns original matches when conversation meta rule cannot be found in regularRules", async () => {
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "executed-rule-1",
    } as any);

    const matches = [{ rule: regularRule }];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [toReplyRule],
      regularRules: [regularRule], // No meta rule
      matches,
    });

    expect(result).toEqual(matches);
  });

  it("does not mutate the original matches array", async () => {
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "executed-rule-1",
    } as any);

    const matches = [{ rule: regularRule }];
    const originalMatches = [...matches];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [toReplyRule],
      regularRules: [regularRule, conversationMetaRule],
      matches,
    });

    expect(matches).toEqual(originalMatches);
    expect(result).not.toBe(matches);
  });

  it("queries database with correct parameters", async () => {
    prisma.executedRule.findFirst.mockResolvedValue(null);

    const matches = [{ rule: regularRule }];

    await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [toReplyRule],
      regularRules: [regularRule, conversationMetaRule],
      matches,
    });

    expect(prisma.executedRule.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId,
        threadId,
        status: ExecutedRuleStatus.APPLIED,
        rule: {
          systemType: {
            in: expect.any(Array),
          },
        },
      },
      select: { id: true },
    });
  });
});
