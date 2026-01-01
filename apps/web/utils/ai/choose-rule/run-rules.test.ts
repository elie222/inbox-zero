import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureConversationRuleContinuity,
  CONVERSATION_TRACKING_META_RULE_ID,
  limitDraftEmailActions,
  runRules,
} from "./run-rules";
import {
  ActionType,
  ExecutedRuleStatus,
  SystemType,
} from "@/generated/prisma/enums";
import type { Action } from "@/generated/prisma/client";
import { ConditionType } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import type { RuleWithActions } from "@/utils/types";
import { getAction, getEmailAccount, getEmail } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

vi.mock("@/utils/prisma");
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn((fn) => fn()) }));
vi.mock("@/utils/ai/choose-rule/match-rules", () => ({
  findMatchingRules: vi.fn(),
}));
vi.mock("@/utils/reply-tracker/handle-conversation-status", () => ({
  determineConversationStatus: vi.fn(),
  updateThreadTrackers: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/choose-args", () => ({
  getActionItemsWithAiArgs: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/execute", () => ({
  executeAct: vi.fn(),
}));
vi.mock("@/utils/reply-tracker/label-helpers", () => ({
  removeConflictingThreadStatusLabels: vi.fn(),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  saveColdEmail: vi.fn(),
}));
vi.mock("@/utils/scheduled-actions/scheduler", () => ({
  scheduleDelayedActions: vi.fn(),
  cancelScheduledActions: vi.fn(),
}));

const emailAccountId = "account-1";
const threadId = "thread-1";

const createRule = (
  id: string,
  systemType: SystemType | null = null,
  actions: Action[] = [],
): RuleWithActions => ({
  id,
  name: `Rule ${id}`,
  instructions: `Instructions for ${id}`,
  enabled: true,
  emailAccountId,
  createdAt: new Date(),
  updatedAt: new Date(),
  actions,
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

describe("ensureConversationRuleContinuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matches unchanged when there are no conversation rules", async () => {
    const matches = [{ rule: regularRule }];

    const result = await ensureConversationRuleContinuity({
      emailAccountId,
      threadId,
      conversationRules: [],
      regularRules: [regularRule],
      matches,
      logger,
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
      logger,
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
      logger,
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
      logger,
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
      logger,
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
      logger,
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
      logger,
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

describe("limitDraftEmailActions", () => {
  it("returns original matches when there are no draft actions", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({
            id: "label-1",
            type: ActionType.LABEL,
            label: "Important",
            ruleId: "rule-1",
          }),
        ]),
      },
      {
        rule: createRule("rule-2", null, [
          getAction({
            id: "move-1",
            type: ActionType.LABEL,
            label: "Handled",
            ruleId: "rule-2",
          }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, logger);

    expect(result).toBe(matches);
  });

  it("returns original matches when there are fewer than two draft actions", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({ id: "draft-1", type: ActionType.DRAFT_EMAIL }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, createScopedLogger("test"));

    expect(result).toBe(matches);
  });

  it("keeps only the draft action with fixed content when multiple drafts exist", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({
            id: "draft-1",
            type: ActionType.DRAFT_EMAIL,
            content: null,
            ruleId: "rule-1",
          }),
        ]),
      },
      {
        rule: createRule("rule-2", null, [
          getAction({
            id: "draft-2",
            type: ActionType.DRAFT_EMAIL,
            content: "Hello {{name}}",
            ruleId: "rule-2",
          }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, logger);

    expect(result[0].rule.actions).toEqual([]);
    expect(result[1].rule.actions).toHaveLength(1);
    expect(result[1].rule.actions[0].id).toBe("draft-2");
  });

  it("retains non-draft actions when removing extra drafts", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({
            id: "draft-1",
            type: ActionType.DRAFT_EMAIL,
            content: null,
            ruleId: "rule-1",
          }),
          getAction({
            id: "label-1",
            type: ActionType.LABEL,
            label: "Important",
            ruleId: "rule-1",
          }),
        ]),
      },
      {
        rule: createRule("rule-2", null, [
          getAction({
            id: "draft-2",
            type: ActionType.DRAFT_EMAIL,
            content: "Template",
            ruleId: "rule-2",
          }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, logger);

    expect(result[0].rule.actions).toHaveLength(1);
    expect(result[0].rule.actions[0].type).toBe(ActionType.LABEL);
    expect(result[1].rule.actions[0].id).toBe("draft-2");
  });

  it("keeps the first draft when multiple drafts share identical fixed content", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({
            id: "draft-1",
            type: ActionType.DRAFT_EMAIL,
            content: "Hello there",
            ruleId: "rule-1",
          }),
        ]),
      },
      {
        rule: createRule("rule-2", null, [
          getAction({
            id: "draft-2",
            type: ActionType.DRAFT_EMAIL,
            content: "Hello there",
            ruleId: "rule-2",
          }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, logger);

    expect(result[0].rule.actions).toHaveLength(1);
    expect(result[0].rule.actions[0].id).toBe("draft-1");
    expect(result[1].rule.actions).toEqual([]);
  });

  it("keeps the first draft when none have fixed content", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({
            id: "draft-1",
            type: ActionType.DRAFT_EMAIL,
            content: null,
            ruleId: "rule-1",
          }),
        ]),
      },
      {
        rule: createRule("rule-2", null, [
          getAction({
            id: "draft-2",
            type: ActionType.DRAFT_EMAIL,
            content: null,
            ruleId: "rule-2",
          }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, logger);

    expect(result[0].rule.actions).toHaveLength(1);
    expect(result[0].rule.actions[0].id).toBe("draft-1");
    expect(result[1].rule.actions).toEqual([]);
  });

  it("prefers static drafts over fully dynamic drafts", () => {
    const matches = [
      {
        rule: createRule("rule-1", null, [
          getAction({
            id: "draft-1",
            type: ActionType.DRAFT_EMAIL,
            content: null,
            ruleId: "rule-1",
          }),
        ]),
      },
      {
        rule: createRule("rule-2", null, [
          getAction({
            id: "draft-2",
            type: ActionType.DRAFT_EMAIL,
            content:
              "Hello {{name}}, this is a template with some fixed content",
            ruleId: "rule-2",
          }),
        ]),
      },
    ];

    const result = limitDraftEmailActions(matches, logger);

    expect(result[0].rule.actions).toEqual([]);
    expect(result[1].rule.actions).toHaveLength(1);
    expect(result[1].rule.actions[0].id).toBe("draft-2");
  });

  it("limits drafts when custom rule and resolved TO_REPLY both have DRAFT_EMAIL", () => {
    const guestsRule = createRule("guests-rule", null, [
      getAction({
        id: "label-guest",
        type: ActionType.LABEL,
        label: "Guest Suggestion",
        ruleId: "guests-rule",
      }),
      getAction({
        id: "draft-guest",
        type: ActionType.DRAFT_EMAIL,
        content: "Hi {{name}}, Thank you for reaching out.",
        ruleId: "guests-rule",
      }),
    ]);

    const toReplyRuleResolved = createRule(
      "to-reply-resolved",
      SystemType.TO_REPLY,
      [
        getAction({
          id: "label-to-reply",
          type: ActionType.LABEL,
          label: "To Reply",
          ruleId: "to-reply-resolved",
        }),
        getAction({
          id: "draft-to-reply",
          type: ActionType.DRAFT_EMAIL,
          content: null,
          ruleId: "to-reply-resolved",
        }),
      ],
    );

    const resolvedMatches = [
      {
        rule: guestsRule,
        matchReasons: undefined,
        resolvedReason: undefined,
        isConversationRule: false,
      },
      {
        rule: toReplyRuleResolved,
        matchReasons: undefined,
        resolvedReason: "Needs reply",
        isConversationRule: true,
      },
    ];

    const result = limitDraftEmailActions(resolvedMatches, logger);

    expect(result[0].rule.actions).toHaveLength(2);
    expect(
      result[0].rule.actions.find((a) => a.type === ActionType.DRAFT_EMAIL)?.id,
    ).toBe("draft-guest");
    expect(result[1].rule.actions).toHaveLength(1);
    expect(result[1].rule.actions[0].type).toBe(ActionType.LABEL);

    const typedResult = result as typeof resolvedMatches;
    expect(typedResult[0].isConversationRule).toBe(false);
    expect(typedResult[1].isConversationRule).toBe(true);
    expect(typedResult[1].resolvedReason).toBe("Needs reply");
  });

  it("keeps first draft when both rules have AI-generated DRAFT_EMAIL", () => {
    const guestsRule = createRule("guests-rule", null, [
      getAction({
        id: "draft-guest",
        type: ActionType.DRAFT_EMAIL,
        content: null,
        ruleId: "guests-rule",
      }),
    ]);

    const toReplyRuleResolved = createRule(
      "to-reply-resolved",
      SystemType.TO_REPLY,
      [
        getAction({
          id: "draft-to-reply",
          type: ActionType.DRAFT_EMAIL,
          content: null,
          ruleId: "to-reply-resolved",
        }),
      ],
    );

    const result = limitDraftEmailActions(
      [{ rule: guestsRule }, { rule: toReplyRuleResolved }],
      logger,
    );

    expect(result[0].rule.actions).toHaveLength(1);
    expect(result[0].rule.actions[0].id).toBe("draft-guest");
    expect(result[1].rule.actions).toEqual([]);
  });
});

describe("runRules - double draft prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes only one DRAFT_EMAIL when custom rule and TO_REPLY both have drafts", async () => {
    const { findMatchingRules } = await import(
      "@/utils/ai/choose-rule/match-rules"
    );
    const { determineConversationStatus } = await import(
      "@/utils/reply-tracker/handle-conversation-status"
    );
    const { getActionItemsWithAiArgs } = await import(
      "@/utils/ai/choose-rule/choose-args"
    );
    const { executeAct } = await import("@/utils/ai/choose-rule/execute");

    const guestsRule = createRule("guests-rule", null, [
      getAction({
        id: "label-guest",
        type: ActionType.LABEL,
        label: "Guest Suggestion",
        ruleId: "guests-rule",
      }),
      getAction({
        id: "draft-guest",
        type: ActionType.DRAFT_EMAIL,
        content: "Hi {{name}}, Please submit via our form.",
        ruleId: "guests-rule",
      }),
    ]);

    const metaRule = createRule(CONVERSATION_TRACKING_META_RULE_ID, null, []);

    const toReplyWithDraft = createRule("to-reply-rule", SystemType.TO_REPLY, [
      getAction({
        id: "label-to-reply",
        type: ActionType.LABEL,
        label: "To Reply",
        ruleId: "to-reply-rule",
      }),
      getAction({
        id: "draft-to-reply",
        type: ActionType.DRAFT_EMAIL,
        content: null,
        ruleId: "to-reply-rule",
      }),
    ]);

    vi.mocked(findMatchingRules).mockResolvedValue({
      matches: [{ rule: guestsRule }, { rule: metaRule }],
      reasoning: "Both rules matched",
    });

    vi.mocked(determineConversationStatus).mockResolvedValue({
      rule: toReplyWithDraft,
      reason: "Email needs a reply",
    });

    vi.mocked(getActionItemsWithAiArgs).mockImplementation(
      async ({ selectedRule }) =>
        selectedRule.actions.map((a) => ({ ...a, type: a.type as ActionType })),
    );

    const executedDraftContents: (string | null)[] = [];
    vi.mocked(executeAct).mockImplementation(async ({ executedRule }) => {
      for (const action of executedRule.actionItems) {
        if (action.type === ActionType.DRAFT_EMAIL) {
          executedDraftContents.push(action.content);
        }
      }
    });

    prisma.executedRule.findFirst.mockResolvedValue(null);

    let createCallCount = 0;
    (prisma.executedRule.create as any).mockImplementation(
      async (args: any) => {
        const actionItems = args.data.actionItems?.createMany?.data || [];
        createCallCount++;
        return {
          id: `exec-${createCallCount}`,
          status: ExecutedRuleStatus.APPLYING,
          ruleId: args.data.rule?.connect?.id ?? null,
          threadId: args.data.threadId,
          messageId: args.data.messageId,
          actionItems: actionItems.map((a: any, idx: number) => ({
            ...a,
            id: a.id || `action-${createCallCount}-${idx}`,
            executedRuleId: `exec-${createCallCount}`,
          })),
        };
      },
    );

    const message = {
      ...getEmail(),
      threadId,
      snippet: "Test snippet",
      historyId: "12345",
      inline: [],
      headers: { "message-id": "msg-1" },
      attachments: [],
    } as any;

    await runRules({
      provider: {} as any,
      message,
      rules: [guestsRule, toReplyWithDraft],
      emailAccount: getEmailAccount(),
      isTest: false,
      modelType: "actionable" as any,
      logger,
    });

    expect(executedDraftContents).toHaveLength(1);
    expect(executedDraftContents[0]).toBe(
      "Hi {{name}}, Please submit via our form.",
    );
  });
});
