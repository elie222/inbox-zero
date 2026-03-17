import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-email-actions
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-email-actions

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-email-actions");

const {
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
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
  mockUnsubscribeSenderAndMark: vi.fn(),
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

describe.runIf(shouldRunEval)("Eval: assistant chat email actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
      if (select?.email) {
        return {
          email: "user@test.com",
          timezone: "America/Los_Angeles",
          meetingBriefingsEnabled: false,
          meetingBriefingsMinutesBefore: 15,
          meetingBriefsSendEmail: false,
          filingEnabled: false,
          filingPrompt: null,
          filingFolders: [],
          driveConnections: [],
        };
      }

      return {
        about: "Keep replies concise and direct.",
        rules: [],
      };
    });

    mockSearchMessages.mockResolvedValue({
      messages: getDefaultSearchMessages(),
      nextPageToken: undefined,
    });

    mockGetMessage.mockImplementation(async (messageId: string) =>
      getMessageById(messageId),
    );

    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: mockSearchMessages,
      getLabels: vi.fn().mockResolvedValue(getDefaultLabels()),
      getMessage: mockGetMessage,
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
    });
  });

  describeEvalMatrix("assistant-chat email actions", (model, emailAccount) => {
    test(
      "uses sendEmail directly for a new outbound draft with an explicit recipient",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "Draft an email to Alex <alex@vendor.test> with the subject Meeting on Tuesday and say that Tuesday at 2pm works for me.",
            },
          ],
        });

        const sendCall = getLastMatchingToolCall(
          toolCalls,
          "sendEmail",
          isSendEmailInput,
        )?.input;

        const pass =
          !!sendCall &&
          sendCall.to.includes("alex@vendor.test") &&
          sendCall.subject === "Meeting on Tuesday" &&
          includesAnyText(sendCall.messageHtml, ["Tuesday", "2pm"]) &&
          !toolCalls.some((toolCall) => toolCall.toolName === "searchInbox") &&
          !toolCalls.some((toolCall) => toolCall.toolName === "replyEmail") &&
          !toolCalls.some((toolCall) => toolCall.toolName === "forwardEmail");

        evalReporter.record({
          testName: "direct draft uses sendEmail",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "uses searchInbox then replyEmail for replies to existing mail",
      async () => {
        mockSearchMessages.mockResolvedValueOnce({
          messages: [
            getMockMessage({
              id: "msg-reply-1",
              threadId: "thread-reply-1",
              from: "ops@partner.example",
              subject: "Question on the revised plan",
              snippet: "Can you send your answer today?",
              labelIds: ["UNREAD"],
            }),
          ],
          nextPageToken: undefined,
        });

        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "Reply to the email from ops@partner.example and say Tuesday at 2pm works for me.",
            },
          ],
        });

        const searchCall = getFirstSearchInboxCall(toolCalls);
        const replyCall = getLastMatchingToolCall(
          toolCalls,
          "replyEmail",
          isReplyEmailInput,
        )?.input;

        const pass =
          !!searchCall &&
          !!replyCall &&
          hasToolBeforeTool(toolCalls, "searchInbox", "replyEmail") &&
          queryContainsAny(searchCall.query, ["ops", "partner", "revised"]) &&
          replyCall.messageId === "msg-reply-1" &&
          includesAnyText(replyCall.content, ["Tuesday", "2pm"]) &&
          !toolCalls.some((toolCall) => toolCall.toolName === "sendEmail");

        evalReporter.record({
          testName: "reply uses search then replyEmail",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "uses searchInbox then forwardEmail for forwarding an existing message",
      async () => {
        mockSearchMessages.mockResolvedValueOnce({
          messages: [
            getMockMessage({
              id: "msg-forward-1",
              threadId: "thread-forward-1",
              from: "support@smtprelay.example",
              subject: "SMTP relay API setup guide",
              snippet: "Here are the connection details for your API client.",
              labelIds: ["UNREAD"],
            }),
          ],
          nextPageToken: undefined,
        });

        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "Forward the SMTP relay setup email to eng@company.test and mention this is the one to use.",
            },
          ],
        });

        const searchCall = getFirstSearchInboxCall(toolCalls);
        const forwardCall = getLastMatchingToolCall(
          toolCalls,
          "forwardEmail",
          isForwardEmailInput,
        )?.input;

        const pass =
          !!searchCall &&
          !!forwardCall &&
          hasToolBeforeTool(toolCalls, "searchInbox", "forwardEmail") &&
          queryContainsAny(searchCall.query, ["smtp", "relay", "setup"]) &&
          forwardCall.messageId === "msg-forward-1" &&
          forwardCall.to.includes("eng@company.test") &&
          includesAnyText(forwardCall.content, ["one to use"]) &&
          !toolCalls.some((toolCall) => toolCall.toolName === "sendEmail");

        evalReporter.record({
          testName: "forward uses search then forwardEmail",
          model: model.label,
          pass,
          actual,
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
  const recordedToolCalls: Array<{ toolName: string; input: unknown }> = [];

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId: emailAccount.id,
    user: emailAccount,
    logger,
    onStepFinish: async ({ toolCalls }) => {
      for (const toolCall of toolCalls || []) {
        recordedToolCalls.push({
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      }
    },
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

type SearchInboxInput = {
  query: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  messageHtml: string;
};

type ReplyEmailInput = {
  messageId: string;
  content: string;
};

type ForwardEmailInput = {
  messageId: string;
  to: string;
  content?: string | null;
};

function isSearchInboxInput(input: unknown): input is SearchInboxInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { query?: unknown }).query === "string"
  );
}

function isSendEmailInput(input: unknown): input is SendEmailInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    to?: unknown;
    subject?: unknown;
    messageHtml?: unknown;
  };

  return (
    typeof value.to === "string" &&
    typeof value.subject === "string" &&
    typeof value.messageHtml === "string"
  );
}

function isReplyEmailInput(input: unknown): input is ReplyEmailInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    messageId?: unknown;
    content?: unknown;
  };

  return (
    typeof value.messageId === "string" && typeof value.content === "string"
  );
}

function isForwardEmailInput(input: unknown): input is ForwardEmailInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    messageId?: unknown;
    to?: unknown;
    content?: unknown;
  };

  return (
    typeof value.messageId === "string" &&
    typeof value.to === "string" &&
    (value.content == null || typeof value.content === "string")
  );
}

function getFirstSearchInboxCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const toolCall = toolCalls.find(
    (candidate) => candidate.toolName === "searchInbox",
  );

  return isSearchInboxInput(toolCall?.input) ? toolCall.input : null;
}

function getLastMatchingToolCall<TInput>(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  toolName: string,
  matches: (input: unknown) => input is TInput,
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== toolName) continue;
    if (!matches(toolCall.input)) continue;

    return {
      index,
      input: toolCall.input,
    };
  }

  return null;
}

function hasToolBeforeTool(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  firstToolName: string,
  secondToolName: string,
) {
  const firstIndex = toolCalls.findIndex(
    (toolCall) => toolCall.toolName === firstToolName,
  );
  const secondIndex = toolCalls.findIndex(
    (toolCall) => toolCall.toolName === secondToolName,
  );

  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function queryContainsAny(query: string, terms: string[]) {
  const normalizedQuery = query.toLowerCase();
  return terms.some((term) => normalizedQuery.includes(term));
}

function includesAnyText(text: string | null | undefined, terms: string[]) {
  if (!text) return false;

  const normalizedText = text.toLowerCase();
  return terms.some((term) => normalizedText.includes(term.toLowerCase()));
}

function summarizeToolCall(toolCall: { toolName: string; input: unknown }) {
  if (isSearchInboxInput(toolCall.input)) {
    return `${toolCall.toolName}(query=${toolCall.input.query})`;
  }

  if (isSendEmailInput(toolCall.input)) {
    return `${toolCall.toolName}(to=${toolCall.input.to}, subject=${toolCall.input.subject})`;
  }

  if (isReplyEmailInput(toolCall.input)) {
    return `${toolCall.toolName}(messageId=${toolCall.input.messageId})`;
  }

  if (isForwardEmailInput(toolCall.input)) {
    return `${toolCall.toolName}(messageId=${toolCall.input.messageId}, to=${toolCall.input.to})`;
  }

  return toolCall.toolName;
}

function getDefaultLabels() {
  return [
    { id: "INBOX", name: "INBOX" },
    { id: "UNREAD", name: "UNREAD" },
    { id: "Label_To Reply", name: "To Reply" },
  ];
}

function getDefaultSearchMessages() {
  return [
    getMockMessage({
      id: "msg-default-1",
      threadId: "thread-default-1",
      from: "updates@product.example",
      subject: "Weekly summary",
      snippet: "A quick summary of this week's updates.",
      labelIds: ["UNREAD"],
    }),
  ];
}

function getMessageById(messageId: string) {
  const messages = [
    getMockMessage({
      id: "msg-reply-1",
      threadId: "thread-reply-1",
      from: "ops@partner.example",
      subject: "Question on the revised plan",
      snippet: "Can you send your answer today?",
      textPlain: "Can you send your answer today?",
      labelIds: ["UNREAD"],
    }),
    getMockMessage({
      id: "msg-forward-1",
      threadId: "thread-forward-1",
      from: "support@smtprelay.example",
      subject: "SMTP relay API setup guide",
      snippet: "Here are the connection details for your API client.",
      textPlain:
        "Use the API key from the dashboard and connect on port 587 with TLS enabled.",
      labelIds: ["UNREAD"],
    }),
  ];

  const message = messages.find((candidate) => candidate.id === messageId);
  if (!message) {
    throw new Error(`Unexpected messageId: ${messageId}`);
  }

  return message;
}
