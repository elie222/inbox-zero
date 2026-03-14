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

// pnpm test-ai eval/assistant-chat-inbox-workflows
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-inbox-workflows

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-inbox-workflows");
const inboxWorkflowProviders = [
  {
    provider: "google",
    label: "google",
    unreadFilter: "is:unread",
  },
  {
    provider: "microsoft",
    label: "microsoft",
    unreadFilter: "isread:false",
  },
] as const;
const writeToolNames = new Set([
  "manageInbox",
  "createRule",
  "updateRuleConditions",
  "updateRuleActions",
  "updateLearnedPatterns",
  "updateAbout",
  "updateAssistantSettings",
  "updateAssistantSettingsCompat",
  "updateInboxFeatures",
  "sendEmail",
  "replyEmail",
  "forwardEmail",
  "saveMemory",
  "addToKnowledgeBase",
]);

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
  mockSearchMessages,
  mockGetMessage,
  mockArchiveThreadWithLabel,
  mockMarkReadThread,
  mockBulkArchiveFromSenders,
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
  mockSearchMessages: vi.fn(),
  mockGetMessage: vi.fn(),
  mockArchiveThreadWithLabel: vi.fn(),
  mockMarkReadThread: vi.fn(),
  mockBulkArchiveFromSenders: vi.fn(),
}));

vi.mock("@/utils/rule/rule", () => ({
  createRule: mockCreateRule,
  partialUpdateRule: mockPartialUpdateRule,
  updateRuleActions: mockUpdateRuleActions,
}));

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

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe.runIf(shouldRunEval)("Eval: assistant chat inbox workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRule.mockResolvedValue({ id: "created-rule-id" });
    mockPartialUpdateRule.mockResolvedValue({ id: "updated-rule-id" });
    mockUpdateRuleActions.mockResolvedValue({ id: "updated-rule-id" });
    mockSaveLearnedPatterns.mockResolvedValue({ success: true });

    prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
      if (select?.rules) {
        return {
          about: "My name is Test User, and I manage a company inbox.",
          rules: [],
        };
      }

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
        about: "My name is Test User, and I manage a company inbox.",
      };
    });

    prisma.emailAccount.update.mockResolvedValue({
      about: "My name is Test User, and I manage a company inbox.",
    });

    prisma.rule.findUnique.mockResolvedValue(null);

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
      archiveThreadWithLabel: mockArchiveThreadWithLabel,
      markReadThread: mockMarkReadThread,
      bulkArchiveFromSenders: mockBulkArchiveFromSenders,
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
    });
  });

  describeEvalMatrix(
    "assistant-chat inbox workflows",
    (model, emailAccount) => {
      test.each(inboxWorkflowProviders)(
        "handles inbox update requests with read-only triage search first [$label]",
        async ({ provider, label, unreadFilter }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-triage-1",
                threadId: "thread-triage-1",
                from: "founder@client.example",
                subject: "Need approval today",
                snippet: "Can you confirm the rollout before 3pm?",
                labelIds: ["UNREAD", "Label_To Reply"],
              }),
              getMockMessage({
                id: "msg-triage-2",
                threadId: "thread-triage-2",
                from: "updates@vendor.example",
                subject: "Weekly platform digest",
                snippet: "Here is this week's product update.",
                labelIds: ["UNREAD"],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            inboxStats: { total: 240, unread: 18 },
            messages: [
              {
                role: "user",
                content: "Help me handle my inbox today.",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);

          const pass =
            !!searchCall &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            hasProviderUnreadFilter(searchCall.query, unreadFilter) &&
            hasNoWriteToolCalls(toolCalls);

          evalReporter.record({
            testName: `inbox update uses triage search first (${label})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "uses read-only inbox search for reply triage requests [$label]",
        async ({ provider, label }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-reply-1",
                threadId: "thread-reply-1",
                from: "ops@partner.example",
                subject: "Question on the revised plan",
                snippet: "Can you send your answer today?",
                labelIds: ["UNREAD", "Label_To Reply"],
              }),
              getMockMessage({
                id: "msg-reply-2",
                threadId: "thread-reply-2",
                from: "digest@briefings.example",
                subject: "Morning roundup",
                snippet: "Here are the top stories for today.",
                labelIds: ["UNREAD"],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            messages: [
              {
                role: "user",
                content: "Do I need to reply to any mail?",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);

          const pass =
            !!searchCall &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            hasReplyTriageFocus(searchCall.query, provider) &&
            hasNoWriteToolCalls(toolCalls);

          evalReporter.record({
            testName: `reply triage stays read-only (${label})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "does not bulk archive sender cleanup before the user confirms [$label]",
        async ({ provider, label }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-cleanup-1",
                threadId: "thread-cleanup-1",
                from: "alerts@sitebuilder.example",
                subject: "Your weekly site report",
                snippet: "Traffic highlights and plugin notices.",
                labelIds: ["UNREAD"],
              }),
              getMockMessage({
                id: "msg-cleanup-2",
                threadId: "thread-cleanup-2",
                from: "alerts@sitebuilder.example",
                subject: "Comment moderation summary",
                snippet: "You have 12 new comments awaiting review.",
                labelIds: [],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            inboxStats: { total: 480, unread: 22 },
            messages: [
              {
                role: "user",
                content: "Delete all SiteBuilder emails from my inbox.",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);

          const pass =
            !!searchCall &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            queryContainsAny(searchCall.query, ["sitebuilder"]) &&
            !toolCalls.some(
              (toolCall) => toolCall.toolName === "manageInbox",
            ) &&
            hasNoWriteToolCalls(toolCalls);

          evalReporter.record({
            testName: `sender cleanup requires confirmation before write (${label})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "uses inbox search for direct email lookup requests [$label]",
        async ({ provider, label }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-search-1",
                threadId: "thread-search-1",
                from: "support@smtprelay.example",
                subject: "SMTP relay API setup guide",
                snippet: "Here are the connection details for your API client.",
                labelIds: ["UNREAD"],
              }),
              getMockMessage({
                id: "msg-search-2",
                threadId: "thread-search-2",
                from: "billing@smtprelay.example",
                subject: "Receipt for your SMTP relay subscription",
                snippet: "Your monthly invoice is attached.",
                labelIds: [],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            messages: [
              {
                role: "user",
                content:
                  "Find me an email related to setting up the SMTP relay API.",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);

          const pass =
            !!searchCall &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            queryContainsAny(searchCall.query, ["smtp", "relay", "api"]) &&
            hasNoWriteToolCalls(toolCalls);

          evalReporter.record({
            testName: `direct email lookup uses search (${label})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "reads the full email after search when the user asks what a message says [$label]",
        async ({ provider, label }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-read-1",
                threadId: "thread-read-1",
                from: "ops@partner.example",
                subject: "Question on the revised plan",
                snippet: "Can you confirm the revised timeline?",
                labelIds: ["UNREAD"],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            messages: [
              {
                role: "user",
                content:
                  "What does the email about the revised plan say? I need the full contents.",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);
          const readCall = getLastMatchingToolCall(
            toolCalls,
            "readEmail",
            isReadEmailInput,
          )?.input;

          const pass =
            !!searchCall &&
            !!readCall &&
            hasSearchBeforeTool(toolCalls, "readEmail") &&
            queryContainsAny(searchCall.query, ["revised", "plan"]) &&
            readCall.messageId === "msg-read-1" &&
            hasNoWriteToolCalls(toolCalls);

          evalReporter.record({
            testName: `search then read full email (${label})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "archives specific searched threads instead of bulk sender cleanup [$label]",
        async ({ provider, label }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-archive-1",
                threadId: "thread-archive-1",
                from: "alerts@sitebuilder.example",
                subject: "Weekly site report",
                snippet: "Traffic highlights and plugin notices.",
                labelIds: ["UNREAD"],
              }),
              getMockMessage({
                id: "msg-archive-2",
                threadId: "thread-archive-2",
                from: "alerts@sitebuilder.example",
                subject: "Comment moderation summary",
                snippet: "You have 12 new comments awaiting review.",
                labelIds: [],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            messages: [
              {
                role: "user",
                content:
                  "Archive the two SiteBuilder emails in my inbox, but do not unsubscribe me or archive everything from that sender.",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);
          const archiveCall = getLastMatchingToolCall(
            toolCalls,
            "manageInbox",
            isManageInboxThreadActionInput,
          )?.input;

          const pass =
            !!searchCall &&
            !!archiveCall &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            queryContainsAny(searchCall.query, ["sitebuilder"]) &&
            archiveCall.action === "archive_threads" &&
            archiveCall.threadIds.length === 2 &&
            archiveCall.threadIds.includes("thread-archive-1") &&
            archiveCall.threadIds.includes("thread-archive-2") &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "manageInbox" &&
                isBulkArchiveSendersInput(toolCall.input),
            );

          evalReporter.record({
            testName: `specific archive uses archive_threads (${label})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "marks specific searched threads read [$label]",
        async ({ provider, label }) => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-markread-1",
                threadId: "thread-markread-1",
                from: "updates@vendor.example",
                subject: "Release notes",
                snippet: "The release has shipped.",
                labelIds: ["UNREAD"],
              }),
              getMockMessage({
                id: "msg-markread-2",
                threadId: "thread-markread-2",
                from: "updates@vendor.example",
                subject: "Maintenance complete",
                snippet: "The maintenance window has ended.",
                labelIds: ["UNREAD"],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            messages: [
              {
                role: "user",
                content:
                  "Mark the two unread vendor update emails as read, but do not archive them.",
              },
            ],
          });

          const searchCall = getFirstSearchInboxCall(toolCalls);
          const markReadCall = getLastMatchingToolCall(
            toolCalls,
            "manageInbox",
            isManageInboxThreadActionInput,
          )?.input;

          const pass =
            !!searchCall &&
            !!markReadCall &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            queryContainsAny(searchCall.query, [
              "vendor",
              "update",
              "unread",
            ]) &&
            markReadCall.action === "mark_read_threads" &&
            markReadCall.threadIds.length === 2 &&
            markReadCall.threadIds.includes("thread-markread-1") &&
            markReadCall.threadIds.includes("thread-markread-2");

          evalReporter.record({
            testName: `specific mark read uses mark_read_threads (${label})`,
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
  inboxStats,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
  inboxStats?: { total: number; unread: number } | null;
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
    inboxStats,
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

type SearchInboxInput = {
  query: string;
  limit?: number;
  pageToken?: string | null;
};

type ReadEmailInput = {
  messageId: string;
};

type ManageInboxThreadActionInput = {
  action: "archive_threads" | "mark_read_threads";
  threadIds: string[];
};

type BulkArchiveSendersInput = {
  action: "bulk_archive_senders";
  fromEmails: string[];
};

function getFirstSearchInboxCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const toolCall = toolCalls.find(
    (candidate) => candidate.toolName === "searchInbox",
  );

  return isSearchInboxInput(toolCall?.input) ? toolCall.input : null;
}

function isSearchInboxInput(input: unknown): input is SearchInboxInput {
  if (!input || typeof input !== "object") return false;

  const value = input as { query?: unknown };

  return typeof value.query === "string";
}

function isReadEmailInput(input: unknown): input is ReadEmailInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { messageId?: unknown }).messageId === "string"
  );
}

function isManageInboxThreadActionInput(
  input: unknown,
): input is ManageInboxThreadActionInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    threadIds?: unknown;
  };

  return (
    (value.action === "archive_threads" ||
      value.action === "mark_read_threads") &&
    Array.isArray(value.threadIds)
  );
}

function isBulkArchiveSendersInput(
  input: unknown,
): input is BulkArchiveSendersInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    fromEmails?: unknown;
  };

  return (
    value.action === "bulk_archive_senders" && Array.isArray(value.fromEmails)
  );
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

function summarizeToolCall(toolCall: { toolName: string; input: unknown }) {
  if (isSearchInboxInput(toolCall.input)) {
    return `${toolCall.toolName}(query=${toolCall.input.query}, limit=${toolCall.input.limit ?? "default"})`;
  }

  return toolCall.toolName;
}

function hasNoWriteToolCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  return !toolCalls.some((toolCall) => isWriteToolName(toolCall.toolName));
}

function hasProviderUnreadFilter(query: string, unreadFilter: string) {
  const normalizedQuery = query.toLowerCase();
  return normalizedQuery.includes(unreadFilter);
}

function hasReplyTriageFocus(query: string, provider: "google" | "microsoft") {
  const normalizedQuery = query.toLowerCase();
  if (provider === "microsoft") {
    return normalizedQuery.includes("isread:false");
  }

  return ["to reply", 'label:"to reply"', "label:to", "reply", "respond"].some(
    (term) => normalizedQuery.includes(term),
  );
}

function queryContainsAny(query: string, terms: string[]) {
  const normalizedQuery = query.toLowerCase();
  return terms.some((term) => normalizedQuery.includes(term));
}

function hasSearchBeforeFirstWrite(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const firstSearchIndex = toolCalls.findIndex(
    (toolCall) => toolCall.toolName === "searchInbox",
  );

  if (firstSearchIndex < 0) return false;

  const firstWriteIndex = toolCalls.findIndex((toolCall) =>
    isWriteToolName(toolCall.toolName),
  );

  return firstWriteIndex < 0 || firstSearchIndex < firstWriteIndex;
}

function hasSearchBeforeTool(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  toolName: string,
) {
  const firstSearchIndex = toolCalls.findIndex(
    (toolCall) => toolCall.toolName === "searchInbox",
  );
  const targetIndex = toolCalls.findIndex(
    (toolCall) => toolCall.toolName === toolName,
  );

  return (
    firstSearchIndex >= 0 && targetIndex >= 0 && firstSearchIndex < targetIndex
  );
}

function isWriteToolName(toolName: string) {
  return writeToolNames.has(toolName);
}

function getDefaultLabels() {
  return [
    { id: "INBOX", name: "INBOX" },
    { id: "UNREAD", name: "UNREAD" },
    { id: "Label_To Reply", name: "To Reply" },
    { id: "Label_FYI", name: "FYI" },
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
    ...getDefaultSearchMessages(),
    getMockMessage({
      id: "msg-read-1",
      threadId: "thread-read-1",
      from: "ops@partner.example",
      subject: "Question on the revised plan",
      snippet: "Can you confirm the revised timeline?",
      textPlain:
        "The revised plan moves the launch to next Tuesday and adds a Friday review checkpoint.",
      labelIds: ["UNREAD"],
    }),
    getMockMessage({
      id: "msg-search-1",
      threadId: "thread-search-1",
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

function cloneEmailAccountForProvider(
  emailAccount: ReturnType<typeof getEmailAccount>,
  provider: "google" | "microsoft",
) {
  return {
    ...emailAccount,
    account: {
      ...emailAccount.account,
      provider,
    },
  };
}
