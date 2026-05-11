import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { getEmailAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-label-management
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-label-management

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-label-management");

const {
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
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
  mockUnsubscribeSenderAndMark: vi.fn(),
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

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe.runIf(shouldRunEval)("Eval: assistant chat label management", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    let labels = [
      { id: "Label_Existing", name: "Existing", type: "user" },
      { id: "Label_Travel", name: "Travel", type: "user" },
      { id: "Label_04_ARCHIVES", name: "04 ARCHIVES", type: "user" },
    ];

    prisma.emailAccount.findUnique.mockResolvedValue({
      about: "I use labels to organize my inbox.",
      rules: [],
    } as any);

    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getLabels: vi.fn().mockImplementation(async () => labels),
      createLabel: vi.fn().mockImplementation(async (name: string) => {
        const createdLabel = {
          id: `Label_${name.replace(/\s+/g, "_")}`,
          name,
          type: "user",
        };
        labels = [...labels, createdLabel];
        return createdLabel;
      }),
      getLabelById: vi
        .fn()
        .mockImplementation(
          async (id: string) => labels.find((label) => label.id === id) ?? null,
        ),
      getLabelByName: vi
        .fn()
        .mockImplementation(
          async (name: string) =>
            labels.find((label) => label.name === name) ?? null,
        ),
      getThreadMessages: vi
        .fn()
        .mockImplementation(async (threadId: string) => [
          { id: `${threadId}-message-1`, threadId },
        ]),
      labelMessage: vi.fn().mockResolvedValue(undefined),
      archiveThreadWithLabel: vi.fn(),
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
    });
  });

  describeEvalMatrix(
    "assistant-chat label management",
    (model, emailAccount) => {
      test(
        "lists labels without attempting creation",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content: "What labels do I already have?",
              },
            ],
          });

          const listLabelsCall = getLastMatchingToolCall(
            toolCalls,
            "listLabels",
            isListLabelsInput,
          );
          const pass =
            !!listLabelsCall &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "createOrGetLabel" &&
                isCreateOrGetLabelInput(toolCall.input),
            ) &&
            !toolCalls.some((toolCall) => toolCall.toolName === "manageInbox");

          evalReporter.record({
            testName: "list labels",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "creates or reuses a label before labeling explicit threads",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content:
                  "Create a Finance label if I do not already have it, then label thread-1 and thread-2 with it.",
              },
            ],
          });

          const createOrGetMatch = getLastMatchingToolCall(
            toolCalls,
            "createOrGetLabel",
            isCreateOrGetLabelInput,
          );
          const labelThreadsMatch = getLastMatchingToolCall(
            toolCalls,
            "manageInbox",
            isManageInboxLabelThreadsInput,
          );
          const createOrGetCall = createOrGetMatch?.input ?? null;
          const labelThreadsCall = labelThreadsMatch?.input ?? null;
          const createOrGetIndex = createOrGetMatch?.index ?? -1;
          const labelThreadsIndex = labelThreadsMatch?.index ?? -1;
          const pass =
            !!createOrGetCall &&
            !!labelThreadsCall &&
            createOrGetCall.name === "Finance" &&
            labelThreadsCall.threadIds.length === 2 &&
            labelThreadsCall.threadIds.includes("thread-1") &&
            labelThreadsCall.threadIds.includes("thread-2") &&
            labelThreadsCall.labelName === "Finance" &&
            labelThreadsCall.action === "label_threads" &&
            createOrGetIndex >= 0 &&
            labelThreadsIndex > createOrGetIndex;

          evalReporter.record({
            testName: "create or get then label threads",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "creates a label without running inbox actions when the user only asks for the label",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content:
                  "Create a label named Finance, but do not apply it to any emails yet.",
              },
            ],
          });

          const createOrGetMatch = getLastMatchingToolCall(
            toolCalls,
            "createOrGetLabel",
            isCreateOrGetLabelInput,
          );
          const createOrGetCall = createOrGetMatch?.input ?? null;
          const pass =
            !!createOrGetCall &&
            createOrGetCall.name === "Finance" &&
            !toolCalls.some((toolCall) => toolCall.toolName === "manageInbox");

          evalReporter.record({
            testName: "create label only",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "applies an existing label to a single explicit thread",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content:
                  "Use my existing Travel label on thread-1. Do not create a new label.",
              },
            ],
          });

          const labelThreadsMatch = getLastMatchingToolCall(
            toolCalls,
            "manageInbox",
            isManageInboxLabelThreadsInput,
          );
          const labelThreadsCall = labelThreadsMatch?.input ?? null;
          const pass =
            !!labelThreadsCall &&
            labelThreadsCall.threadIds.length === 1 &&
            labelThreadsCall.threadIds[0] === "thread-1" &&
            labelThreadsCall.labelName === "Travel" &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "createOrGetLabel" &&
                isCreateOrGetLabelInput(toolCall.input),
            );

          evalReporter.record({
            testName: "apply existing label to one thread",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "applies an existing label to multiple explicit threads",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content:
                  "Label thread-1 and thread-2 with my Travel label. It already exists.",
              },
            ],
          });

          const labelThreadsMatch = getLastMatchingToolCall(
            toolCalls,
            "manageInbox",
            isManageInboxLabelThreadsInput,
          );
          const labelThreadsCall = labelThreadsMatch?.input ?? null;
          const pass =
            !!labelThreadsCall &&
            labelThreadsCall.threadIds.length === 2 &&
            labelThreadsCall.threadIds.includes("thread-1") &&
            labelThreadsCall.threadIds.includes("thread-2") &&
            labelThreadsCall.labelName === "Travel" &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "createOrGetLabel" &&
                isCreateOrGetLabelInput(toolCall.input),
            );

          evalReporter.record({
            testName: "apply existing label to multiple threads",
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "keeps spaced label names separate from the label_threads action",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount,
            messages: [
              {
                role: "user",
                content:
                  'Apply my existing "04 ARCHIVES" label to thread-1 and thread-2.',
              },
            ],
          });

          const labelThreadsMatch = getLastMatchingToolCall(
            toolCalls,
            "manageInbox",
            isManageInboxLabelThreadsInput,
          );
          const labelThreadsCall = labelThreadsMatch?.input ?? null;
          const pass =
            !!labelThreadsCall &&
            labelThreadsCall.action === "label_threads" &&
            labelThreadsCall.labelName === "04 ARCHIVES" &&
            labelThreadsCall.threadIds.length === 2 &&
            labelThreadsCall.threadIds.includes("thread-1") &&
            labelThreadsCall.threadIds.includes("thread-2") &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "createOrGetLabel" &&
                isCreateOrGetLabelInput(toolCall.input),
            ) &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "listLabels" &&
                isListLabelsInput(toolCall.input),
            );

          evalReporter.record({
            testName: "apply spaced existing label to explicit threads",
            model: model.label,
            pass,
            actual,
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

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}) {
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
  });

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
  };
}

type CreateOrGetLabelInput = {
  name: string;
};

type ManageInboxLabelThreadsInput = {
  action: "label_threads";
  labelName: string;
  threadIds: string[];
};

function isListLabelsInput(input: unknown): input is Record<string, never> {
  return (
    !!input && typeof input === "object" && Object.keys(input).length === 0
  );
}

function isCreateOrGetLabelInput(
  input: unknown,
): input is CreateOrGetLabelInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { name?: unknown }).name === "string"
  );
}

function isManageInboxLabelThreadsInput(
  input: unknown,
): input is ManageInboxLabelThreadsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    labelName?: unknown;
    threadIds?: unknown;
  };

  return (
    value.action === "label_threads" &&
    typeof value.labelName === "string" &&
    Array.isArray(value.threadIds)
  );
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (
    toolCall.toolName === "createOrGetLabel" &&
    isCreateOrGetLabelInput(toolCall.input)
  ) {
    return `${toolCall.toolName}(${toolCall.input.name})`;
  }

  if (toolCall.toolName === "listLabels" && isListLabelsInput(toolCall.input)) {
    return `${toolCall.toolName}()`;
  }

  if (isManageInboxLabelThreadsInput(toolCall.input)) {
    return `${toolCall.toolName}(label_threads:${toolCall.input.threadIds.length})`;
  }

  return toolCall.toolName;
}
