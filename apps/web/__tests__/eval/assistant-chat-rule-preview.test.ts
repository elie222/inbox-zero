import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatTrace,
  hasAssistantWriteToolCalls,
  getFirstMatchingToolCall,
  summarizeRecordedToolCalls,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-rule-preview.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-rule-preview.test.ts

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-rule-preview",
});
const logger = createScopedLogger("eval-assistant-chat-rule-preview");

const previewMessage = getMockMessage({
  id: "msg-rule-preview-1",
  threadId: "thread-rule-preview-1",
  from: "news@product.example",
  to: "user@account.example",
  subject: "Your weekly product update",
  snippet: "Here is what shipped this week.",
  textPlain: "Here is what shipped this week.",
  textHtml: "<p>Here is what shipped this week.</p>",
  labelIds: ["UNREAD"],
});

const accountSnapshot = {
  id: "email-account-rule-preview-1",
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
  mockRunRulesOnMessage,
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
  mockRunRulesOnMessage: vi.fn(),
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

vi.mock("@/utils/ai/choose-rule/run-rules-on-message", () => ({
  runRulesOnMessage: mockRunRulesOnMessage,
}));

vi.mock("@/env", async () => {
  const { buildAssistantChatEvalEnv } = await vi.importActual<
    typeof import("@/__tests__/eval/assistant-chat-eval-env")
  >("@/__tests__/eval/assistant-chat-eval-env");

  return {
    env: buildAssistantChatEvalEnv(),
  };
});

describe.runIf(shouldRunEval)("Eval: assistant chat rule preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue(accountSnapshot);
    prisma.emailAccount.update.mockResolvedValue({});
    prisma.automationJob.findUnique.mockResolvedValue(null);
    prisma.chatMemory.findMany.mockResolvedValue([]);
    prisma.chatMemory.findFirst.mockResolvedValue(null);
    prisma.chatMemory.create.mockResolvedValue({});

    mockSearchMessages.mockResolvedValue({
      messages: [previewMessage],
      nextPageToken: undefined,
    });
    mockGetMessage.mockResolvedValue(previewMessage);
    mockRunRulesOnMessage.mockResolvedValue([
      {
        rule: { name: "Notification" },
        reason: "Automated product update.",
        status: "APPLIED",
        existing: false,
        actionItems: [{ type: "LABEL", label: "Notification" }],
      },
    ]);
    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: mockSearchMessages,
      getMessage: mockGetMessage,
      getLabels: vi.fn().mockResolvedValue([]),
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getThreadMessages: vi.fn().mockResolvedValue([previewMessage]),
    });
  });

  describeEvalMatrix("assistant-chat rule preview", (model, emailAccount) => {
    test(
      "runs the rules as a preview instead of guessing which rule applies",
      async () => {
        const trace = await captureAssistantChatTrace({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "Find my latest email and preview which of my rules would handle it. Don't change anything.",
            },
          ],
          logger,
        });

        const previewCall = getFirstMatchingToolCall(
          trace.toolCalls,
          "runRulesOnEmail",
          isRunRulesInput,
        );

        const pass =
          !!previewCall &&
          previewCall.input.messageId === previewMessage.id &&
          previewCall.input.apply === false &&
          !hasAssistantWriteToolCalls(trace.toolCalls);

        evalReporter.record({
          testName: "preview request runs runRulesOnEmail with apply=false",
          model: model.label,
          pass,
          actual: summarizeRecordedToolCalls(
            trace.toolCalls,
            (toolCall) =>
              `${toolCall.toolName}:${JSON.stringify(toolCall.input)}`,
          ),
          criteria: [],
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

function isRunRulesInput(
  input: unknown,
): input is { messageId: string; apply: boolean } {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { messageId?: unknown }).messageId === "string" &&
    typeof (input as { apply?: unknown }).apply === "boolean"
  );
}
