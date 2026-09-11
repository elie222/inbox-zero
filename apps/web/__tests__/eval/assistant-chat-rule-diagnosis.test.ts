import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatTrace,
  getFirstMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import type { getEmailAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-rule-diagnosis.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-rule-diagnosis.test.ts

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-rule-diagnosis",
});
const logger = createScopedLogger("eval-assistant-chat-rule-diagnosis");

const diagnosisMessage = getMockMessage({
  id: "msg-rule-diagnosis-1",
  threadId: "thread-rule-diagnosis-1",
  from: "alerts@workspace.example",
  to: "user@account.example",
  subject: "Workspace access notice",
  snippet: "A workspace access setting was updated.",
  textPlain: "A workspace access setting was updated for your account.",
  textHtml: "<p>A workspace access setting was updated for your account.</p>",
  labelIds: ["UNREAD"],
});

const accountSnapshot = {
  id: "email-account-rule-diagnosis-1",
  email: "user@account.example",
  timezone: "America/Los_Angeles",
  about: "Keep replies concise.",
  rulesRevision: 1,
  multiRuleSelectionEnabled: false,
  meetingBriefingsEnabled: false,
  meetingBriefingsMinutesBefore: 15,
  meetingBriefsSendEmail: false,
  filingEnabled: false,
  filingPrompt: null,
  writingStyle: null,
  signature: null,
  includeReferralSignature: false,
  followUpAwaitingReplyDays: 3,
  followUpNeedsReplyDays: 2,
  followUpAutoDraftEnabled: false,
  digestSchedule: null,
  automationJob: null,
  messagingChannels: [],
  knowledge: [],
  filingFolders: [],
  driveConnections: [],
  rules: [
    {
      id: "rule-notification-1",
      name: "Notification",
      instructions:
        "Match automated product and account updates that do not need a reply.",
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      from: null,
      to: null,
      subject: null,
      conditionalOperator: "AND",
      enabled: true,
      runOnThreads: false,
      actions: [
        {
          type: "LABEL",
          content: null,
          label: "Notification",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          url: null,
          folderName: null,
          delayInMinutes: null,
        },
      ],
    },
  ],
};

const {
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockSearchMessages,
  mockGetMessage,
} = vi.hoisted(() => ({
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
  mockSearchMessages: vi.fn(),
  mockGetMessage: vi.fn(),
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

vi.mock("@/utils/prisma");

vi.mock("@/env", async () => {
  const { buildAssistantChatEvalEnv } = await vi.importActual<
    typeof import("@/__tests__/eval/assistant-chat-eval-env")
  >("@/__tests__/eval/assistant-chat-eval-env");

  return {
    env: buildAssistantChatEvalEnv(),
  };
});

describe.runIf(shouldRunEval)("Eval: assistant chat rule diagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue(accountSnapshot);
    prisma.emailAccount.update.mockResolvedValue({});
    prisma.automationJob.findUnique.mockResolvedValue(null);
    prisma.chatMemory.findMany.mockResolvedValue([]);
    prisma.chatMemory.findFirst.mockResolvedValue(null);
    prisma.chatMemory.create.mockResolvedValue({});

    mockSearchMessages.mockResolvedValue({
      messages: [diagnosisMessage],
      nextPageToken: undefined,
    });
    mockGetMessage.mockResolvedValue(diagnosisMessage);
    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: mockSearchMessages,
      getMessage: mockGetMessage,
      getLabels: vi.fn().mockResolvedValue([]),
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getThreadMessages: vi.fn().mockResolvedValue([diagnosisMessage]),
    });
  });

  describeEvalMatrix("assistant-chat rule diagnosis", (model, emailAccount) => {
    test(
      "treats fallback-only skipped execution evidence as inconclusive",
      async () => {
        prisma.executedRule.findMany.mockResolvedValue([
          {
            id: "executed-rule-fallback-1",
            ruleId: null,
            threadId: diagnosisMessage.threadId,
            createdAt: new Date("2026-08-01T09:00:00.000Z"),
            status: "SKIPPED",
            reason: "No rules matched.",
            matchMetadata: null,
            automated: true,
            actionItems: [],
            rule: null,
          },
        ]);

        const trace = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "Why didn't the Notification rule match the workspace access notice from alerts@workspace.example?",
            },
          ],
        });

        const executionCall = getFirstMatchingToolCall(
          trace.toolCalls,
          "getRuleExecutionForMessage",
          isGetRuleExecutionInput,
        );
        const assistantText = getAssistantText(trace);
        const diagnosisJudge = assistantText
          ? await judgeEvalOutput({
              input: [
                "The user asked why a specific active rule did not match a specific email.",
                "The assistant found the email and loaded its exact execution history.",
                'The only record has status="SKIPPED", ruleName=null, reason="No rules matched.", and no actions.',
                "This fallback record establishes that no rule match was recorded, but it does not show whether the Notification rule was evaluated or why it did not match.",
              ].join("\n"),
              output: assistantText,
              expected:
                "A concise response that reports the recorded no-match outcome while saying the available evidence is insufficient to determine why the Notification rule missed. It must not present pre-classification, routing, filtering, or another pipeline stage as the proven cause.",
              criterion: {
                name: "Inconclusive fallback-only diagnosis",
                description:
                  "A fallback-only SKIPPED execution can support saying that no rule match was recorded. It cannot establish that the target rule was evaluated, skipped before evaluation, or blocked by a particular pipeline stage. The response should preserve that uncertainty and avoid inventing a specific root cause.",
              },
            })
          : null;

        const pass =
          !!executionCall &&
          executionCall.input.messageId === diagnosisMessage.id &&
          !hasWriteToolCalls(trace.toolCalls) &&
          !!diagnosisJudge?.pass &&
          queriedExecutionForMessage(emailAccount.id);

        evalReporter.record({
          testName: "fallback-only skipped execution stays inconclusive",
          model: model.label,
          pass,
          actual: formatActual(trace, assistantText, diagnosisJudge),
          criteria: diagnosisJudge ? [diagnosisJudge] : [],
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "does not turn an empty execution history into a claimed cause",
      async () => {
        prisma.executedRule.findMany.mockResolvedValue([]);

        const trace = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "Why didn't the Notification rule match the workspace access notice from alerts@workspace.example?",
            },
          ],
        });

        const executionCall = getFirstMatchingToolCall(
          trace.toolCalls,
          "getRuleExecutionForMessage",
          isGetRuleExecutionInput,
        );
        const assistantText = getAssistantText(trace);
        const diagnosisJudge = assistantText
          ? await judgeEvalOutput({
              input: [
                "The user asked why a specific active rule did not match a specific email.",
                "The assistant found the email and loaded its exact execution history.",
                "The execution lookup returned an empty executions array.",
                "An empty history does not establish whether the email was never processed, whether records are missing, or whether any particular pipeline stage caused the outcome.",
              ].join("\n"),
              output: assistantText,
              expected:
                "A concise response that says no execution record was found and therefore the cause cannot be determined from the available evidence. It must not claim that the email was unprocessed, pre-classified, filtered, or otherwise explain the missing match as fact.",
              criterion: {
                name: "No invented cause from empty execution history",
                description:
                  "When the exact execution lookup returns no records, the assistant should distinguish missing evidence from evidence of a cause. It may describe plausible next checks, but must not turn any possibility into a confirmed explanation.",
              },
            })
          : null;

        const pass =
          !!executionCall &&
          executionCall.input.messageId === diagnosisMessage.id &&
          !hasWriteToolCalls(trace.toolCalls) &&
          !!diagnosisJudge?.pass &&
          queriedExecutionForMessage(emailAccount.id);

        evalReporter.record({
          testName: "empty execution history does not become a cause",
          model: model.label,
          pass,
          actual: formatActual(trace, assistantText, diagnosisJudge),
          criteria: diagnosisJudge ? [diagnosisJudge] : [],
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}) {
  return captureAssistantChatTrace({
    emailAccount,
    messages,
    logger,
  });
}

function isGetRuleExecutionInput(
  input: unknown,
): input is { messageId: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { messageId?: unknown }).messageId === "string"
  );
}

function queriedExecutionForMessage(emailAccountId: string) {
  return prisma.executedRule.findMany.mock.calls.some(
    ([args]) =>
      args?.where?.messageId === diagnosisMessage.id &&
      args?.where?.emailAccountId === emailAccountId,
  );
}

function getAssistantText(trace: Awaited<ReturnType<typeof runAssistantChat>>) {
  return trace.stepTexts.join("\n\n").trim() || trace.finalText.trim();
}

function hasWriteToolCalls(toolCalls: RecordedToolCall[]) {
  const writeToolNames = new Set([
    "manageInbox",
    "createRule",
    "updateRule",
    "updateRuleConditions",
    "updateRuleActions",
    "updateLearnedPatterns",
    "updatePersonalInstructions",
    "updateAssistantSettings",
    "sendEmail",
    "replyEmail",
    "forwardEmail",
    "saveMemory",
    "addToKnowledgeBase",
  ]);

  return toolCalls.some((toolCall) => writeToolNames.has(toolCall.toolName));
}

function formatActual(
  trace: Awaited<ReturnType<typeof runAssistantChat>>,
  assistantText: string,
  judgeResult: Awaited<ReturnType<typeof judgeEvalOutput>> | null,
) {
  return [
    summarizeRecordedToolCalls(
      trace.toolCalls,
      (toolCall) => `${toolCall.toolName}:${JSON.stringify(toolCall.input)}`,
    ),
    assistantText && judgeResult
      ? formatSemanticJudgeActual(assistantText, judgeResult)
      : assistantText
        ? `assistant=${JSON.stringify(assistantText)}`
        : "no assistant text",
  ].join(" | ");
}
