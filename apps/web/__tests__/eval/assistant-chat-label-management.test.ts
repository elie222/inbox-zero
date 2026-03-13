import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { getEmailAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";

// pnpm test-ai eval/assistant-chat-label-management
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-label-management

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const hasAnyEvalApiKey = Boolean(
  process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY,
);
const hasDefaultEvalApiKey = Boolean(process.env.OPENROUTER_API_KEY);
const shouldRunEval = isAiTest
  ? process.env.EVAL_MODELS
    ? hasAnyEvalApiKey
    : hasDefaultEvalApiKey
  : false;
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
    ];

    prisma.emailAccount.findUnique.mockResolvedValue({
      about: "I use labels to organize my inbox.",
      rules: [],
    } as any);

    mockCreateEmailProvider.mockResolvedValue({
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
      getLabelById: vi.fn().mockImplementation(async (id: string) => {
        return labels.find((label) => label.id === id) ?? null;
      }),
      getLabelByName: vi.fn().mockImplementation(async (name: string) => {
        return labels.find((label) => label.name === name) ?? null;
      }),
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

          const manageLabelsCall = getLastManageLabelsCall(toolCalls);
          const pass =
            !!manageLabelsCall &&
            manageLabelsCall.action === "list" &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "manageLabels" &&
                isManageLabelsCreateOrGetInput(toolCall.input),
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

          const createOrGetCall = getLastManageLabelsCreateOrGetCall(toolCalls);
          const labelThreadsCall = getLastLabelThreadsCall(toolCalls);
          const createOrGetIndex = getLastToolCallIndex(
            toolCalls,
            "manageLabels",
          );
          const labelThreadsIndex = getLastToolCallIndex(
            toolCalls,
            "manageInbox",
          );
          const pass =
            !!createOrGetCall &&
            !!labelThreadsCall &&
            createOrGetCall.name === "Finance" &&
            labelThreadsCall.threadIds.length === 2 &&
            labelThreadsCall.threadIds.includes("thread-1") &&
            labelThreadsCall.threadIds.includes("thread-2") &&
            typeof labelThreadsCall.labelId === "string" &&
            labelThreadsCall.labelId.length > 0 &&
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
  const recordedToolCalls: Array<{ toolName: string; input: unknown }> = [];
  const recordingSession = {
    record: vi.fn(
      async (type: string, data: { request?: { toolCalls?: any[] } }) => {
        if (type !== "chat-step") return;

        for (const toolCall of data.request?.toolCalls || []) {
          recordedToolCalls.push({
            toolName: toolCall.toolName,
            input: toolCall.input,
          });
        }
      },
    ),
  };

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId: emailAccount.id,
    user: emailAccount,
    logger,
    recordingSession,
  });

  await result.consumeStream();

  const actual =
    recordedToolCalls.length > 0
      ? recordedToolCalls.map(summarizeToolCall).join(" | ")
      : "no tool calls";

  return {
    toolCalls: recordedToolCalls,
    actual,
  };
}

type ManageLabelsListInput = {
  action: "list";
};

type ManageLabelsCreateOrGetInput = {
  action: "createOrGet";
  name: string;
};

type ManageInboxLabelThreadsInput = {
  action: "label_threads";
  labelId: string;
  threadIds: string[];
};

function getLastManageLabelsCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const toolCall = [...toolCalls]
    .reverse()
    .find((candidate) => candidate.toolName === "manageLabels");

  return isManageLabelsInput(toolCall?.input) ? toolCall.input : null;
}

function getLastManageLabelsCreateOrGetCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const toolCall = [...toolCalls]
    .reverse()
    .find((candidate) => candidate.toolName === "manageLabels");

  return isManageLabelsCreateOrGetInput(toolCall?.input)
    ? toolCall.input
    : null;
}

function getLastLabelThreadsCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const toolCall = [...toolCalls]
    .reverse()
    .find((candidate) => candidate.toolName === "manageInbox");

  return isManageInboxLabelThreadsInput(toolCall?.input)
    ? toolCall.input
    : null;
}

function isManageLabelsInput(
  input: unknown,
): input is ManageLabelsListInput | ManageLabelsCreateOrGetInput {
  return (
    isManageLabelsListInput(input) || isManageLabelsCreateOrGetInput(input)
  );
}

function isManageLabelsListInput(
  input: unknown,
): input is ManageLabelsListInput {
  return (
    !!input &&
    typeof input === "object" &&
    "action" in input &&
    (input as { action?: unknown }).action === "list"
  );
}

function isManageLabelsCreateOrGetInput(
  input: unknown,
): input is ManageLabelsCreateOrGetInput {
  return (
    !!input &&
    typeof input === "object" &&
    "action" in input &&
    (input as { action?: unknown }).action === "createOrGet" &&
    typeof (input as { name?: unknown }).name === "string"
  );
}

function isManageInboxLabelThreadsInput(
  input: unknown,
): input is ManageInboxLabelThreadsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    labelId?: unknown;
    threadIds?: unknown;
  };

  return (
    value.action === "label_threads" &&
    typeof value.labelId === "string" &&
    Array.isArray(value.threadIds)
  );
}

function summarizeToolCall(toolCall: { toolName: string; input: unknown }) {
  if (isManageLabelsCreateOrGetInput(toolCall.input)) {
    return `${toolCall.toolName}(createOrGet:${toolCall.input.name})`;
  }

  if (isManageLabelsListInput(toolCall.input)) {
    return `${toolCall.toolName}(list)`;
  }

  if (isManageInboxLabelThreadsInput(toolCall.input)) {
    return `${toolCall.toolName}(label_threads:${toolCall.input.threadIds.length})`;
  }

  return toolCall.toolName;
}

function getLastToolCallIndex(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  toolName: string,
) {
  return toolCalls.findLastIndex((toolCall) => toolCall.toolName === toolName);
}
