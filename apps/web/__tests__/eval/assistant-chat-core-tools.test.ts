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

// pnpm test-ai eval/assistant-chat-core-tools
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-core-tools

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const MULTI_STEP_TIMEOUT = 120_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-core-tools");

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

const baseAccountSnapshot = {
  id: "email-account-1",
  email: "user@test.com",
  timezone: "America/Los_Angeles",
  about: "Keep replies concise.",
  multiRuleSelectionEnabled: false,
  meetingBriefingsEnabled: true,
  meetingBriefingsMinutesBefore: 240,
  meetingBriefsSendEmail: true,
  filingEnabled: false,
  filingPrompt: null,
  writingStyle: "Friendly",
  signature: "Best,\nUser",
  includeReferralSignature: false,
  followUpAwaitingReplyDays: 3,
  followUpNeedsReplyDays: 2,
  followUpAutoDraftEnabled: true,
  digestSchedule: null,
  rules: [],
  automationJob: null,
  messagingChannels: [],
  knowledge: [],
  filingFolders: [],
  driveConnections: [],
};

describe.runIf(shouldRunEval)("Eval: assistant chat core tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    prisma.emailAccount.update.mockResolvedValue({});
    prisma.automationJob.findUnique.mockResolvedValue(null);
    prisma.chatMemory.findMany.mockResolvedValue([]);
    prisma.chatMemory.findFirst.mockResolvedValue(null);
    prisma.chatMemory.create.mockResolvedValue({});

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
      archiveThreadWithLabel: vi.fn(),
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
      createLabel: vi.fn().mockImplementation(async (name: string) => ({
        id: `Label_${name.replace(/\s+/g, "_")}`,
        name,
        type: "user",
      })),
      getLabelByName: vi.fn().mockResolvedValue(null),
      getThreadMessages: vi
        .fn()
        .mockImplementation(async (threadId: string) => [
          { id: `${threadId}-message-1`, threadId },
        ]),
      labelMessage: vi.fn().mockResolvedValue(undefined),
    });
  });

  describeEvalMatrix("assistant-chat core tools", (model, emailAccount) => {
    test(
      "calls getAccountOverview for account info queries",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Tell me about my email account",
            },
          ],
        });

        const pass = toolCalls.some(
          (tc) => tc.toolName === "getAccountOverview",
        );

        evalReporter.record({
          testName: "getAccountOverview for account info",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "calls getAssistantCapabilities or getAccountOverview for feature queries",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "What features are enabled on my account?",
            },
          ],
        });

        const pass = toolCalls.some(
          (tc) =>
            tc.toolName === "getAssistantCapabilities" ||
            tc.toolName === "getAccountOverview",
        );

        evalReporter.record({
          testName: "feature query uses capabilities or overview",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "searches then reads full email content when asked",
      async () => {
        mockSearchMessages.mockResolvedValueOnce({
          messages: [
            getMockMessage({
              id: "msg-contract-1",
              threadId: "thread-contract-1",
              from: "legal@acme.example",
              subject: "Updated contract for Q3",
              snippet: "Please review the attached contract.",
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
              content: "Read me the full email about the contract",
            },
          ],
        });

        const searchCall = getFirstMatchingToolCall(
          toolCalls,
          "searchInbox",
          isSearchInboxInput,
        );
        const readCall = getLastMatchingToolCall(
          toolCalls,
          "readEmail",
          isReadEmailInput,
        );

        const pass =
          !!searchCall &&
          !!readCall &&
          searchCall.index < readCall.index &&
          readCall.input.messageId === "msg-contract-1";

        evalReporter.record({
          testName: "search then read full email",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      MULTI_STEP_TIMEOUT,
    );

    test(
      "reads email from prior search results using messageId",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Search for emails from Alice",
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I found an email from Alice about the project timeline.",
                },
                {
                  type: "tool-call",
                  toolCallId: "tc-search-1",
                  toolName: "searchInbox",
                  input: { query: "from:alice@partner.example" },
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "tc-search-1",
                  toolName: "searchInbox",
                  output: {
                    type: "json" as const,
                    value: {
                      queryUsed: "from:alice@partner.example",
                      totalReturned: 1,
                      messages: [
                        {
                          messageId: "msg-alice-1",
                          threadId: "thread-alice-1",
                          subject: "Project timeline update",
                          from: "alice@partner.example",
                          snippet: "Here is the updated timeline.",
                          date: new Date().toISOString(),
                          isUnread: true,
                        },
                      ],
                    },
                  },
                },
              ],
            },
            {
              role: "user",
              content: "What does that email from Alice say?",
            },
          ],
        });

        const readCall = getLastMatchingToolCall(
          toolCalls,
          "readEmail",
          isReadEmailInput,
        );

        const pass = !!readCall && readCall.input.messageId === "msg-alice-1";

        evalReporter.record({
          testName: "read email from prior search results",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      MULTI_STEP_TIMEOUT,
    );

    test(
      "calls updateAssistantSettings to turn on meeting briefs",
      async () => {
        prisma.emailAccount.findUnique.mockResolvedValue({
          ...baseAccountSnapshot,
          meetingBriefingsEnabled: false,
        });

        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Turn on meeting briefs",
            },
          ],
        });

        const settingsCall = getLastMatchingToolCall(
          toolCalls,
          "updateAssistantSettings",
          isUpdateAssistantSettingsInput,
        );

        const pass =
          !!settingsCall &&
          settingsCall.input.changes.some(
            (c: { path: string; value: unknown }) =>
              c.path === "assistant.meetingBriefs.enabled" && c.value === true,
          );

        evalReporter.record({
          testName: "turn on meeting briefs",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "calls updateAssistantSettings to enable auto-file attachments",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Enable auto-file attachments",
            },
          ],
        });

        const settingsCall = getLastMatchingToolCall(
          toolCalls,
          "updateAssistantSettings",
          isUpdateAssistantSettingsInput,
        );

        const pass =
          !!settingsCall &&
          settingsCall.input.changes.some(
            (c: { path: string; value: unknown }) =>
              c.path === "assistant.attachmentFiling.enabled" &&
              c.value === true,
          );

        evalReporter.record({
          testName: "enable auto-file attachments",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "calls manageInbox with mark_read_threads for explicit threads",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Search for unread emails from vendor updates",
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I found 2 unread vendor update emails.",
                },
                {
                  type: "tool-call",
                  toolCallId: "tc-search-2",
                  toolName: "searchInbox",
                  input: { query: "from:updates@vendor.example is:unread" },
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "tc-search-2",
                  toolName: "searchInbox",
                  output: {
                    type: "json" as const,
                    value: {
                      queryUsed: "from:updates@vendor.example is:unread",
                      totalReturned: 2,
                      messages: [
                        {
                          messageId: "msg-vendor-1",
                          threadId: "thread-vendor-1",
                          subject: "Release notes v3.2",
                          from: "updates@vendor.example",
                          snippet: "New features in this release.",
                          date: new Date().toISOString(),
                          isUnread: true,
                        },
                        {
                          messageId: "msg-vendor-2",
                          threadId: "thread-vendor-2",
                          subject: "Maintenance window",
                          from: "updates@vendor.example",
                          snippet: "Scheduled maintenance this weekend.",
                          date: new Date().toISOString(),
                          isUnread: true,
                        },
                      ],
                    },
                  },
                },
              ],
            },
            {
              role: "user",
              content: "Mark those emails as read",
            },
          ],
        });

        const manageCall = getLastMatchingToolCall(
          toolCalls,
          "manageInbox",
          isManageInboxInput,
        );

        const pass =
          !!manageCall &&
          manageCall.input.action === "mark_read_threads" &&
          Array.isArray(manageCall.input.threadIds) &&
          manageCall.input.threadIds.length === 2 &&
          manageCall.input.threadIds.includes("thread-vendor-1") &&
          manageCall.input.threadIds.includes("thread-vendor-2");

        evalReporter.record({
          testName: "mark_read_threads with prior search results",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      MULTI_STEP_TIMEOUT,
    );

    test(
      "calls manageInbox with archive_threads for explicit threads",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Search for last week's newsletter emails",
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I found 2 newsletter emails from last week.",
                },
                {
                  type: "tool-call",
                  toolCallId: "tc-search-3",
                  toolName: "searchInbox",
                  input: { query: "newsletter older_than:7d" },
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "tc-search-3",
                  toolName: "searchInbox",
                  output: {
                    type: "json" as const,
                    value: {
                      queryUsed: "newsletter older_than:7d",
                      totalReturned: 2,
                      messages: [
                        {
                          messageId: "msg-nl-1",
                          threadId: "thread-nl-1",
                          subject: "Weekly digest",
                          from: "digest@newsletter.example",
                          snippet: "This week in tech.",
                          date: new Date().toISOString(),
                          isUnread: false,
                        },
                        {
                          messageId: "msg-nl-2",
                          threadId: "thread-nl-2",
                          subject: "Product updates",
                          from: "news@product.example",
                          snippet: "New features this month.",
                          date: new Date().toISOString(),
                          isUnread: false,
                        },
                      ],
                    },
                  },
                },
              ],
            },
            {
              role: "user",
              content: "Archive those emails",
            },
          ],
        });

        const manageCall = getLastMatchingToolCall(
          toolCalls,
          "manageInbox",
          isManageInboxInput,
        );

        const pass =
          !!manageCall &&
          manageCall.input.action === "archive_threads" &&
          Array.isArray(manageCall.input.threadIds) &&
          manageCall.input.threadIds.length === 2 &&
          manageCall.input.threadIds.includes("thread-nl-1") &&
          manageCall.input.threadIds.includes("thread-nl-2");

        evalReporter.record({
          testName: "archive_threads with prior search results",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      MULTI_STEP_TIMEOUT,
    );

    test(
      "calls createOrGetLabel for label creation requests",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content: "Create a label called Urgent",
            },
          ],
        });

        const createLabelCall = getLastMatchingToolCall(
          toolCalls,
          "createOrGetLabel",
          isCreateOrGetLabelInput,
        );

        const pass =
          !!createLabelCall &&
          createLabelCall.input.name.toLowerCase() === "urgent";

        evalReporter.record({
          testName: "createOrGetLabel for label creation",
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

type ReadEmailInput = {
  messageId: string;
};

type UpdateAssistantSettingsInput = {
  changes: Array<{
    path: string;
    value: unknown;
  }>;
};

type ManageInboxInput = {
  action: string;
  threadIds?: string[] | null;
  fromEmails?: string[] | null;
};

type CreateOrGetLabelInput = {
  name: string;
};

function isSearchInboxInput(input: unknown): input is SearchInboxInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { query?: unknown }).query === "string"
  );
}

function isReadEmailInput(input: unknown): input is ReadEmailInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { messageId?: unknown }).messageId === "string"
  );
}

function isUpdateAssistantSettingsInput(
  input: unknown,
): input is UpdateAssistantSettingsInput {
  return (
    !!input &&
    typeof input === "object" &&
    Array.isArray((input as { changes?: unknown }).changes)
  );
}

function isManageInboxInput(input: unknown): input is ManageInboxInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { action?: unknown }).action === "string"
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

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (isSearchInboxInput(toolCall.input)) {
    return `${toolCall.toolName}(query=${toolCall.input.query})`;
  }

  if (isReadEmailInput(toolCall.input)) {
    return `${toolCall.toolName}(messageId=${toolCall.input.messageId})`;
  }

  if (isManageInboxInput(toolCall.input)) {
    const threadCount = toolCall.input.threadIds?.length ?? 0;
    return `${toolCall.toolName}(action=${toolCall.input.action}, threads=${threadCount})`;
  }

  if (isCreateOrGetLabelInput(toolCall.input)) {
    return `${toolCall.toolName}(name=${toolCall.input.name})`;
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
      id: "msg-contract-1",
      threadId: "thread-contract-1",
      from: "legal@acme.example",
      subject: "Updated contract for Q3",
      snippet: "Please review the attached contract.",
      textPlain:
        "Dear User,\n\nPlease review the attached contract for Q3. The key changes include updated payment terms and a new liability clause.\n\nBest regards,\nLegal Team",
      labelIds: ["UNREAD"],
    }),
    getMockMessage({
      id: "msg-alice-1",
      threadId: "thread-alice-1",
      from: "alice@partner.example",
      subject: "Project timeline update",
      snippet: "Here is the updated timeline.",
      textPlain:
        "Hi,\n\nThe project timeline has been pushed back by two weeks. New deadline is March 15. Please update your schedules accordingly.\n\nThanks,\nAlice",
      labelIds: ["UNREAD"],
    }),
    getMockMessage({
      id: "msg-default-1",
      threadId: "thread-default-1",
      from: "updates@product.example",
      subject: "Weekly summary",
      snippet: "A quick summary of this week's updates.",
      textPlain: "This week we shipped three new features and fixed 12 bugs.",
      labelIds: ["UNREAD"],
    }),
  ];

  const message = messages.find((candidate) => candidate.id === messageId);
  if (!message) {
    throw new Error(`Unexpected messageId: ${messageId}`);
  }

  return message;
}
