import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  captureAssistantChatToolCalls,
  getFirstMatchingToolCall,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-email-actions
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-email-actions

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-email-actions");
const scenarios: EvalScenario[] = [
  {
    title:
      "uses sendEmail directly for a new outbound draft with an explicit recipient",
    reportName: "direct draft uses sendEmail",
    prompt:
      "Draft an email to Alex <alex@vendor.test> with the subject Meeting on Tuesday and say that Tuesday at 2pm works for me.",
    expectation: {
      kind: "send_email",
      recipient: "alex@vendor.test",
      subject: "Meeting on Tuesday",
      terms: ["Tuesday", "2pm"],
      disallowedTools: ["searchInbox", "replyEmail", "forwardEmail"],
    },
  },
  {
    title: "uses searchInbox then replyEmail for replies to existing mail",
    reportName: "reply uses search then replyEmail",
    prompt:
      "Reply to the email from ops@partner.example and say Tuesday at 2pm works for me.",
    searchMessages: [
      getMockMessage({
        id: "msg-reply-1",
        threadId: "thread-reply-1",
        from: "ops@partner.example",
        subject: "Question on the revised plan",
        snippet: "Can you send your answer today?",
        labelIds: ["UNREAD"],
      }),
    ],
    expectation: {
      kind: "reply_email",
      searchTerms: ["ops", "partner", "revised"],
      messageId: "msg-reply-1",
      terms: ["Tuesday", "2pm"],
      disallowedTools: ["sendEmail"],
    },
  },
  {
    title:
      "uses searchInbox then forwardEmail for forwarding an existing message",
    reportName: "forward uses search then forwardEmail",
    prompt:
      "Forward the SMTP relay setup email to eng@company.test and mention this is the one to use.",
    searchMessages: [
      getMockMessage({
        id: "msg-forward-1",
        threadId: "thread-forward-1",
        from: "support@smtprelay.example",
        subject: "SMTP relay API setup guide",
        snippet: "Here are the connection details for your API client.",
        labelIds: ["UNREAD"],
      }),
    ],
    expectation: {
      kind: "forward_email",
      searchTerms: ["smtp", "relay", "setup"],
      messageId: "msg-forward-1",
      recipient: "eng@company.test",
      terms: ["one to use"],
      disallowedTools: ["sendEmail"],
    },
  },
];

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
    for (const scenario of scenarios) {
      test(
        scenario.title,
        async () => {
          if (scenario.searchMessages) {
            mockSearchMessages.mockResolvedValueOnce({
              messages: scenario.searchMessages,
              nextPageToken: undefined,
            });
          }

          const result = await runAssistantChat({
            emailAccount,
            messages: [{ role: "user", content: scenario.prompt }],
          });

          const pass = evaluateScenario(result, scenario.expectation);

          evalReporter.record({
            testName: scenario.reportName,
            model: model.label,
            pass,
            actual: result.actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );
    }
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

type ScenarioExpectation =
  | {
      kind: "send_email";
      recipient: string;
      subject: string;
      terms: string[];
      disallowedTools: string[];
    }
  | {
      kind: "reply_email";
      searchTerms: string[];
      messageId: string;
      terms: string[];
      disallowedTools: string[];
    }
  | {
      kind: "forward_email";
      searchTerms: string[];
      messageId: string;
      recipient: string;
      terms: string[];
      disallowedTools: string[];
    };

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  searchMessages?: ReturnType<typeof getMockMessage>[];
  expectation: ScenarioExpectation;
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

function getFirstSearchInboxCall(toolCalls: RecordedToolCall[]) {
  return getFirstMatchingToolCall(toolCalls, "searchInbox", isSearchInboxInput)
    ?.input;
}

function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  expectation: ScenarioExpectation,
) {
  switch (expectation.kind) {
    case "send_email": {
      const sendCall = getLastMatchingToolCall(
        result.toolCalls,
        "sendEmail",
        isSendEmailInput,
      )?.input;

      return (
        !!sendCall &&
        sendCall.to.includes(expectation.recipient) &&
        sendCall.subject === expectation.subject &&
        includesAnyText(sendCall.messageHtml, expectation.terms) &&
        hasNoToolCalls(result.toolCalls, expectation.disallowedTools)
      );
    }

    case "reply_email": {
      const searchCall = getFirstSearchInboxCall(result.toolCalls);
      const replyCall = getLastMatchingToolCall(
        result.toolCalls,
        "replyEmail",
        isReplyEmailInput,
      )?.input;

      return (
        !!searchCall &&
        !!replyCall &&
        hasToolBeforeTool(result.toolCalls, "searchInbox", "replyEmail") &&
        queryContainsAny(searchCall.query, expectation.searchTerms) &&
        replyCall.messageId === expectation.messageId &&
        includesAnyText(replyCall.content, expectation.terms) &&
        hasNoToolCalls(result.toolCalls, expectation.disallowedTools)
      );
    }

    case "forward_email": {
      const searchCall = getFirstSearchInboxCall(result.toolCalls);
      const forwardCall = getLastMatchingToolCall(
        result.toolCalls,
        "forwardEmail",
        isForwardEmailInput,
      )?.input;

      return (
        !!searchCall &&
        !!forwardCall &&
        hasToolBeforeTool(result.toolCalls, "searchInbox", "forwardEmail") &&
        queryContainsAny(searchCall.query, expectation.searchTerms) &&
        forwardCall.messageId === expectation.messageId &&
        forwardCall.to.includes(expectation.recipient) &&
        includesAnyText(forwardCall.content, expectation.terms) &&
        hasNoToolCalls(result.toolCalls, expectation.disallowedTools)
      );
    }
  }
}

function hasToolBeforeTool(
  toolCalls: RecordedToolCall[],
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

function hasNoToolCalls(toolCalls: RecordedToolCall[], toolNames: string[]) {
  return !toolCalls.some((toolCall) => toolNames.includes(toolCall.toolName));
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

function summarizeToolCall(toolCall: RecordedToolCall) {
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
