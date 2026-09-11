import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastRuleActionsUpdate,
  hasActionType,
  hasLabelAction,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { runAssistantEpisode } from "@/__tests__/eval/assistant-chat-episode-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  buildDefaultSystemRuleRows,
  configureRuleEvalPrisma,
  configureRuleEvalProvider,
  configureRuleMutationMocks,
  senderListHasValue,
} from "@/__tests__/eval/assistant-chat-rule-eval-test-utils";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { getMockMessage, type getEmailAccount } from "@/__tests__/helpers";
import type { MessageContext } from "@/utils/ai/assistant/chat-context-validation";
import {
  ActionType,
  GroupItemType,
  LogicalOperator,
  type SystemType,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing-overlap-exceptions
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing-overlap-exceptions

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-rule-editing-overlap-exceptions",
});
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-overlap-exceptions",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = buildDefaultSystemRuleRows(ruleUpdatedAt);
const about = "I manage a company inbox.";

const workspaceNoticeMessage = getMockMessage({
  id: "message-workspace-notice",
  threadId: "thread-workspace-notice",
  from: "updates@workspace.example",
  to: "assistant-user@account.example",
  subject: "Workspace access setting changed",
  snippet: "A workspace access setting was updated.",
  textPlain: "A workspace access setting was updated for your account.",
  textHtml: "<p>A workspace access setting was updated for your account.</p>",
});

const serviceNoticeMessage = getMockMessage({
  id: "message-service-notice",
  threadId: "thread-service-notice",
  from: "notices@service.example",
  to: "assistant-user@account.example",
  subject: "Service status notice",
  snippet: "A service status setting changed.",
  textPlain: "A service status setting changed for your account.",
  textHtml: "<p>A service status setting changed for your account.</p>",
});

const keepInInboxRule = {
  id: "keep-in-inbox-rule-id",
  name: "Things to keep in Inbox",
  instructions: null,
  updatedAt: ruleUpdatedAt,
  from: "vip@important.example",
  to: null,
  subject: null,
  conditionalOperator: LogicalOperator.AND,
  enabled: true,
  runOnThreads: true,
  systemType: null as SystemType | null,
  actions: [
    {
      type: ActionType.LABEL,
      content: null,
      label: "IMPORTANT",
      to: null,
      cc: null,
      bcc: null,
      subject: null,
      url: null,
      folderName: null,
    },
  ],
};

const teamMailRule = {
  id: "team-mail-rule-id",
  name: "Team Mail",
  instructions:
    "Apply this rule to internal company emails, but exclude store@company.example.",
  updatedAt: ruleUpdatedAt,
  from: "@company.example",
  to: null,
  subject: null,
  conditionalOperator: LogicalOperator.AND,
  enabled: true,
  runOnThreads: true,
  systemType: null as SystemType | null,
  actions: [
    {
      type: ActionType.LABEL,
      content: null,
      label: "Team",
      to: null,
      cc: null,
      bcc: null,
      subject: null,
      url: null,
      folderName: null,
    },
  ],
};

const shippingUpdatesRule = {
  id: "shipping-updates-rule-id",
  name: "Shipping Updates",
  instructions: "Apply this rule to store receipts and shipping updates.",
  updatedAt: ruleUpdatedAt,
  from: "store@company.example",
  to: null,
  subject: null,
  conditionalOperator: LogicalOperator.AND,
  enabled: true,
  runOnThreads: true,
  systemType: null as SystemType | null,
  actions: [
    {
      type: ActionType.LABEL,
      content: null,
      label: "Receipts",
      to: null,
      cc: null,
      bcc: null,
      subject: null,
      url: null,
      folderName: null,
    },
    {
      type: ActionType.ARCHIVE,
      content: null,
      label: null,
      to: null,
      cc: null,
      bcc: null,
      subject: null,
      url: null,
      folderName: null,
    },
  ],
};

const ruleRows = [
  ...defaultRuleRows,
  keepInInboxRule,
  teamMailRule,
  shippingUpdatesRule,
];

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockUpdateRuleActions: vi.fn(),
  mockSaveLearnedPatterns: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
  mockRedis: {
    set: vi.fn(),
    rpush: vi.fn(),
    hincrby: vi.fn(),
    expire: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    llen: vi.fn().mockResolvedValue(0),
    lrange: vi.fn().mockResolvedValue([]),
  },
  mockUnsubscribeSenderAndMark: vi.fn(),
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const { buildRuleModuleMutationMock } = await import(
    "@/__tests__/eval/assistant-chat-rule-eval-test-utils"
  );

  return buildRuleModuleMutationMock({
    importOriginal: () => importOriginal<typeof import("@/utils/rule/rule")>(),
    mockCreateRule,
    mockPartialUpdateRule,
    mockUpdateRuleActions,
  });
});

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: mockSaveLearnedPatterns,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", async () => {
  const { buildAssistantChatEvalEnv } = await vi.importActual<
    typeof import("@/__tests__/eval/assistant-chat-eval-env")
  >("@/__tests__/eval/assistant-chat-eval-env");

  return {
    env: buildAssistantChatEvalEnv(),
  };
});

describe.runIf(shouldRunEval)("Eval: assistant chat overlap exceptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    configureRuleMutationMocks({
      mockCreateRule,
      mockPartialUpdateRule,
      mockUpdateRuleActions,
      mockSaveLearnedPatterns,
    });

    configureRuleEvalPrisma({
      about,
      ruleRows,
      groupItemsByRuleName: {
        Newsletter: [
          {
            type: GroupItemType.FROM,
            value: "daily@briefing.example",
            exclude: false,
          },
        ],
        "Things to keep in Inbox": [
          {
            type: GroupItemType.FROM,
            value: "vip@important.example",
            exclude: false,
          },
        ],
        "Team Mail": [
          {
            type: GroupItemType.FROM,
            value: "no-reply@company.example",
            exclude: false,
          },
          {
            type: GroupItemType.FROM,
            value: "store@company.example",
            exclude: true,
          },
        ],
        "Shipping Updates": [
          {
            type: GroupItemType.FROM,
            value: "store@company.example",
            exclude: false,
          },
        ],
      },
    });

    configureRuleEvalProvider({
      mockCreateEmailProvider,
      ruleRows,
    });
  });

  describeEvalMatrix(
    "assistant-chat overlap exceptions",
    (model, emailAccount) => {
      test(
        "moves a sender from Newsletter into an existing keep-in-inbox rule",
        async () => {
          const { toolCalls, actual, didSaveLearnedPatterns } =
            await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "I already have Newsletter and Things to keep in Inbox rules. Emails from daily@briefing.example should stay in my inbox and stop getting treated like Newsletter emails. Update my existing rules.",
                },
              ],
            });

          const keepUpdate = getMatchingLearnedPatternsUpdate(toolCalls, {
            ruleName: "Things to keep in Inbox",
            includes: ["daily@briefing.example"],
          });
          const newsletterUpdate = getMatchingLearnedPatternsUpdate(toolCalls, {
            ruleName: "Newsletter",
            excludes: ["daily@briefing.example"],
          });

          const pass =
            !!keepUpdate &&
            !!newsletterUpdate &&
            !toolCalls.some((toolCall) => toolCall.toolName === "createRule") &&
            !toolCalls.some(
              (toolCall) => toolCall.toolName === "updateRuleConditions",
            ) &&
            !toolCalls.some(
              (toolCall) => toolCall.toolName === "updateRuleActions",
            ) &&
            didSaveLearnedPatterns;

          evalReporter.record({
            testName: "move sender into keep-in-inbox rule",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "fix-rule avoids creating an overlapping broad domain rule",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content:
                  "Create a new rule for emails like this: emails from our company domain should be labeled Action and should stay out of archive flows.",
              },
            ],
            context: buildFixRuleContext(),
          });

          const updateActionsCall = getLastRuleActionsUpdate(toolCalls);

          const pass =
            !!updateActionsCall &&
            updateActionsCall.ruleName === "Team Mail" &&
            hasLabelAction(updateActionsCall.actions, "Action") &&
            !hasActionType(updateActionsCall.actions, ActionType.ARCHIVE) &&
            !toolCalls.some((toolCall) => toolCall.toolName === "createRule") &&
            !toolCalls.some(
              (toolCall) => toolCall.toolName === "updateLearnedPatterns",
            );

          evalReporter.record({
            testName: "fix-rule avoids overlapping broad domain rule",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "repeated missed-rule feedback updates the existing rule without overclaiming",
        async () => {
          const episode = await runAssistantEpisode({
            emailAccount,
            logger,
            turns: [
              {
                userMessage:
                  "This workspace access notice should have matched my existing Notification rule, but it did not. Please correct that rule.",
                context: buildMissedNotificationContext(workspaceNoticeMessage),
              },
              {
                userMessage:
                  "It happened again with this separate service status notice. It should also have matched the same existing Notification rule. Please correct the rule without creating a duplicate.",
                context: buildMissedNotificationContext(serviceNoticeMessage),
              },
            ],
          });

          const firstTurnUpdate = getMatchingLearnedPatternsUpdate(
            episode.traces[0]?.toolCalls ?? [],
            {
              ruleName: "Notification",
              includes: ["updates@workspace.example"],
            },
          );
          const secondTurnUpdate = getMatchingLearnedPatternsUpdate(
            episode.traces[1]?.toolCalls ?? [],
            {
              ruleName: "Notification",
              includes: ["notices@service.example"],
            },
          );
          const toolCalls = episode.traces.flatMap((trace) => trace.toolCalls);
          const assistantResponses = episode.traces
            .map(
              (trace, index) =>
                `Turn ${index + 1}: ${trace.stepTexts.join("\n\n").trim() || trace.finalText.trim()}`,
            )
            .join("\n\n");

          const [evidenceJudge, calibrationJudge] = await Promise.all([
            judgeEvalOutput({
              input: [
                "Across two turns, the user reported two distinct synthetic notification emails that should have matched the existing Notification rule.",
                'For each email, the only classification evidence says "No rules matched" and the expected outcome is the existing Notification rule.',
                "No execution trace or diagnostic evidence establishes why either earlier match was missed.",
                "The assistant successfully saved a learned sender pattern to the existing Notification rule for each email.",
              ].join("\n"),
              output: assistantResponses,
              expected:
                "Both responses may say what rule correction was made, but must keep the prior miss's root cause unknown rather than presenting a routing, pre-classification, filtering, model, or other mechanism as proven.",
              criterion: {
                name: "No invented cause across repeated feedback",
                description:
                  "For both turns, distinguish the observed no-match outcome from an explanation of why it happened. Do not state a specific root cause as fact when the supplied evidence does not establish one.",
              },
            }),
            judgeEvalOutput({
              input: [
                "The assistant added learned sender patterns to an existing Notification rule for two reported misses.",
                "A rule correction can improve future classification, but the available evidence cannot guarantee flawless execution or matching for every future message.",
              ].join("\n"),
              output: assistantResponses,
              expected:
                "Both responses should describe the correction in calibrated terms and avoid guaranteeing perfect, certain, or universal future matching.",
              criterion: {
                name: "No perfect future-matching promise",
                description:
                  "The assistant may confidently report the completed rule edits and say they should improve matching. It must not promise that future processing is infallible or that every future email is certain to match.",
              },
            }),
          ]);

          const pass =
            !!firstTurnUpdate &&
            !!secondTurnUpdate &&
            ruleWritesOnlyTargetExistingRule(toolCalls, "Notification") &&
            evidenceJudge.pass &&
            calibrationJudge.pass;

          evalReporter.record({
            testName:
              "repeated missed-rule feedback stays targeted and calibrated",
            model: model.label,
            pass,
            actual: [
              summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
              formatSemanticJudgeActual(assistantResponses, evidenceJudge),
              formatSemanticJudgeActual(assistantResponses, calibrationJudge),
            ].join(" | "),
            criteria: [evidenceJudge, calibrationJudge],
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );
    },
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

type UpdateLearnedPatternsInput = {
  ruleName: string;
  learnedPatterns: Array<{
    include?: {
      from?: string | null;
      subject?: string | null;
    } | null;
    exclude?: {
      from?: string | null;
      subject?: string | null;
    } | null;
  }>;
};

async function runAssistantChat({
  emailAccount,
  messages,
  context,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
  context?: MessageContext;
}) {
  const saveLearnedPatternsCallsBefore =
    mockSaveLearnedPatterns.mock.calls.length;
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    context,
    logger,
  });
  const saveLearnedPatternsCallsAfter =
    mockSaveLearnedPatterns.mock.calls.length;

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
    didSaveLearnedPatterns:
      saveLearnedPatternsCallsAfter > saveLearnedPatternsCallsBefore,
  };
}

function getMatchingLearnedPatternsUpdate(
  toolCalls: RecordedToolCall[],
  {
    ruleName,
    includes = [],
    excludes = [],
  }: {
    ruleName: string;
    includes?: string[];
    excludes?: string[];
  },
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== "updateLearnedPatterns") continue;
    if (!isUpdateLearnedPatternsInput(toolCall.input)) continue;
    if (toolCall.input.ruleName !== ruleName) continue;
    if (
      !includes.every((expectedFrom) =>
        hasIncludedFrom(toolCall.input.learnedPatterns, expectedFrom),
      )
    ) {
      continue;
    }
    if (
      !excludes.every((expectedFrom) =>
        hasExcludedFrom(toolCall.input.learnedPatterns, expectedFrom),
      )
    ) {
      continue;
    }

    return toolCall.input;
  }

  return null;
}

function isUpdateLearnedPatternsInput(
  input: unknown,
): input is UpdateLearnedPatternsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    ruleName?: unknown;
    learnedPatterns?: unknown;
  };

  return (
    typeof value.ruleName === "string" && Array.isArray(value.learnedPatterns)
  );
}

function hasIncludedFrom(
  learnedPatterns: UpdateLearnedPatternsInput["learnedPatterns"],
  expectedFrom: string,
) {
  return learnedPatterns.some(
    (pattern) =>
      !!pattern.include?.from &&
      senderListHasValue(pattern.include.from, expectedFrom),
  );
}

function hasExcludedFrom(
  learnedPatterns: UpdateLearnedPatternsInput["learnedPatterns"],
  expectedFrom: string,
) {
  return learnedPatterns.some(
    (pattern) =>
      !!pattern.exclude?.from &&
      senderListHasValue(pattern.exclude.from, expectedFrom),
  );
}

function buildFixRuleContext(): MessageContext {
  const message = getMockMessage({
    id: "message-fix-overlap",
    threadId: "thread-fix-overlap",
    from: "ops@company.example",
    to: "user@test.com",
    subject: "Quarterly planning update",
    snippet: "Sharing the latest internal planning notes.",
    textPlain:
      "Hi team,\n\nSharing the latest internal planning notes for next quarter.\n\nThanks.",
    textHtml:
      "<p>Hi team,</p><p>Sharing the latest internal planning notes for next quarter.</p><p>Thanks.</p>",
  });

  return {
    type: "fix-rule",
    message: {
      id: message.id,
      threadId: message.threadId,
      snippet: message.snippet,
      textPlain: message.textPlain,
      textHtml: message.textHtml,
      headers: {
        from: message.headers.from,
        to: message.headers.to,
        subject: message.headers.subject,
        date: message.headers.date,
      },
      internalDate: message.date,
    },
    results: [
      {
        ruleName: "Team Mail",
        systemType: null,
        reason:
          "Matched the Team Mail rule because the sender domain matches @company.example.",
      },
    ],
    expected: "new",
  };
}

function buildMissedNotificationContext(
  message: ReturnType<typeof getMockMessage>,
): MessageContext {
  return {
    type: "fix-rule",
    message: {
      id: message.id,
      threadId: message.threadId,
      snippet: message.snippet,
      textPlain: message.textPlain,
      textHtml: message.textHtml,
      headers: {
        from: message.headers.from,
        to: message.headers.to,
        subject: message.headers.subject,
        date: message.headers.date,
      },
      internalDate: message.date,
    },
    results: [
      {
        ruleName: null,
        systemType: null,
        reason: "No rules matched.",
      },
    ],
    expected: {
      id: "notification-rule-id",
      name: "Notification",
    },
  };
}

function ruleWritesOnlyTargetExistingRule(
  toolCalls: RecordedToolCall[],
  expectedRuleName: string,
) {
  const existingRuleWriteToolNames = new Set([
    "updateLearnedPatterns",
    "updateRule",
    "updateRuleConditions",
    "updateRuleActions",
  ]);

  return toolCalls.every((toolCall) => {
    if (toolCall.toolName === "createRule") return false;
    if (!existingRuleWriteToolNames.has(toolCall.toolName)) return true;

    return (
      typeof toolCall.input === "object" &&
      toolCall.input !== null &&
      (toolCall.input as { ruleName?: unknown }).ruleName === expectedRuleName
    );
  });
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (!isUpdateLearnedPatternsInput(toolCall.input)) {
    return toolCall.toolName;
  }

  const includeValues = toolCall.input.learnedPatterns
    .flatMap((pattern) => [pattern.include?.from ?? null])
    .filter((value): value is string => Boolean(value));
  const excludeValues = toolCall.input.learnedPatterns
    .flatMap((pattern) => [pattern.exclude?.from ?? null])
    .filter((value): value is string => Boolean(value));

  return `${toolCall.toolName}(rule=${toolCall.input.ruleName}; include=${includeValues.join("|") || "none"}; exclude=${excludeValues.join("|") || "none"})`;
}
