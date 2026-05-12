import type { ModelMessage } from "ai";
import { beforeEach, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getFirstMatchingToolCall,
  getLastMatchingToolCall as getSharedLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { shouldRunEvalTests } from "@/__tests__/eval/models";
import { judgeEvalOutput } from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import type { getEmailAccount } from "@/__tests__/helpers";
import { FOLDER_SEPARATOR } from "@/utils/outlook/folders";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

export const shouldRunEval = shouldRunEvalTests();
export const TIMEOUT = 120_000;
const logger = createScopedLogger("eval-assistant-chat-inbox-workflows");
const forbiddenMicrosoftQueryOperators = [
  "is:",
  "label:",
  "in:",
  "category:",
  "has:",
];

export const inboxWorkflowProviders = [
  {
    provider: "google",
    label: "google",
    unreadSignal: "is:unread",
  },
  {
    provider: "microsoft",
    label: "microsoft",
    unreadSignal: "unread",
  },
] as const;

const writeToolNames = new Set([
  "manageInbox",
  "createRule",
  "updateRuleConditions",
  "updateRuleActions",
  "updateLearnedPatterns",
  "updatePersonalInstructions",
  "updateAssistantSettings",
  "sendEmail",
  "replyEmail",
  "forwardEmail",
  "createOrGetFolder",
  "moveThreadsToFolder",
  "saveMemory",
  "addToKnowledgeBase",
]);

const hoisted = vi.hoisted(() => ({
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
  mockGetFolders: vi.fn(),
  mockGetOrCreateFolderIdByName: vi.fn(),
  mockMoveThreadToFolder: vi.fn(),
}));

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockGetMessage,
  mockArchiveThreadWithLabel,
  mockMarkReadThread,
  mockBulkArchiveFromSenders,
} = hoisted;

export const mockSearchMessages = hoisted.mockSearchMessages;
export const mockGetFolders = hoisted.mockGetFolders;
export const mockGetOrCreateFolderIdByName =
  hoisted.mockGetOrCreateFolderIdByName;
export const mockMoveThreadToFolder = hoisted.mockMoveThreadToFolder;

vi.mock("@/utils/rule/rule", () => ({
  createRule: hoisted.mockCreateRule,
  partialUpdateRule: hoisted.mockPartialUpdateRule,
  updateRuleActions: hoisted.mockUpdateRuleActions,
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: hoisted.mockSaveLearnedPatterns,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: hoisted.mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: hoisted.mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: hoisted.mockRedis,
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: hoisted.mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

export function setupInboxWorkflowEval() {
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
    mockGetFolders.mockResolvedValue(getDefaultFolders());
    mockGetOrCreateFolderIdByName.mockImplementation(async (folderName) => {
      const folder = flattenFolders(getDefaultFolders()).find(
        (candidate) =>
          candidate.displayName.toLowerCase() ===
            String(folderName).trim().toLowerCase() ||
          candidate.path.toLowerCase() ===
            String(folderName).trim().toLowerCase(),
      );

      return folder?.id ?? "folder-created";
    });
    mockMoveThreadToFolder.mockResolvedValue(undefined);

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
      getFolders: mockGetFolders,
      getOrCreateFolderIdByName: mockGetOrCreateFolderIdByName,
      moveThreadToFolder: mockMoveThreadToFolder,
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
    });
  });
}

export async function runAssistantChat({
  emailAccount,
  messages,
  inboxStats,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
  inboxStats?: { total: number; unread: number } | null;
}) {
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    inboxStats,
    logger,
  });

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
  };
}

export function getFirstSearchInboxCall(toolCalls: RecordedToolCall[]) {
  return getFirstMatchingToolCall(toolCalls, "searchInbox", isSearchInboxInput)
    ?.input;
}

export const getLastMatchingToolCall = getSharedLastMatchingToolCall;

export function isReadEmailInput(input: unknown): input is ReadEmailInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { messageId?: unknown }).messageId === "string"
  );
}

export function isManageInboxThreadActionInput(
  input: unknown,
): input is ManageInboxThreadActionInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    threadIds?: unknown;
  };

  return (
    (value.action === "archive_threads" ||
      value.action === "trash_threads" ||
      value.action === "mark_read_threads") &&
    Array.isArray(value.threadIds)
  );
}

export function isBulkArchiveSendersInput(
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

export function hasNoWriteToolCalls(toolCalls: RecordedToolCall[]) {
  return !toolCalls.some((toolCall) => isWriteToolName(toolCall.toolName));
}

export function hasUnreadTriageSignal(
  query: string,
  provider: "google" | "microsoft",
  unreadSignal: string,
) {
  const normalizedQuery = query.toLowerCase();

  if (provider === "microsoft") {
    return (
      /\bunread\b/.test(normalizedQuery) &&
      !containsForbiddenMicrosoftQueryOperator(normalizedQuery)
    );
  }

  return normalizedQuery.includes(unreadSignal);
}

export function hasReplyTriageFocus(
  query: string,
  provider: "google" | "microsoft",
) {
  const normalizedQuery = query.toLowerCase();
  if (provider === "microsoft") {
    return (
      !containsForbiddenMicrosoftQueryOperator(normalizedQuery) &&
      ["reply", "respond"].some((term) => normalizedQuery.includes(term))
    );
  }

  return ["to reply", 'label:"to reply"', "label:to", "reply", "respond"].some(
    (term) => normalizedQuery.includes(term),
  );
}

export async function judgeSearchInboxQuery({
  prompt,
  query,
  expected,
}: {
  prompt: string;
  query: string;
  expected: string;
}) {
  return judgeEvalOutput({
    input: prompt,
    output: query,
    expected,
    criterion: {
      name: "Search query semantics",
      description:
        "The generated inbox search query should semantically target the requested messages even if the exact wording differs from the prompt.",
    },
  });
}

export function hasSearchBeforeFirstWrite(toolCalls: RecordedToolCall[]) {
  const firstSearchIndex = toolCalls.findIndex(
    (toolCall) => toolCall.toolName === "searchInbox",
  );

  if (firstSearchIndex < 0) return false;

  const firstWriteIndex = toolCalls.findIndex((toolCall) =>
    isWriteToolName(toolCall.toolName),
  );

  return firstWriteIndex < 0 || firstSearchIndex < firstWriteIndex;
}

export function hasSearchBeforeTool(
  toolCalls: RecordedToolCall[],
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

export function cloneEmailAccountForProvider(
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

function containsForbiddenMicrosoftQueryOperator(query: string) {
  return forbiddenMicrosoftQueryOperators.some((token) =>
    query.includes(token),
  );
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
  action: "archive_threads" | "trash_threads" | "mark_read_threads";
  threadIds: string[];
};

type BulkArchiveSendersInput = {
  action: "bulk_archive_senders";
  fromEmails: string[];
};

function isSearchInboxInput(input: unknown): input is SearchInboxInput {
  if (!input || typeof input !== "object") return false;

  const value = input as { query?: unknown };

  return typeof value.query === "string";
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (isSearchInboxInput(toolCall.input)) {
    return `${toolCall.toolName}(query=${toolCall.input.query}, limit=${toolCall.input.limit ?? "default"})`;
  }

  return toolCall.toolName;
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

function getDefaultFolders() {
  return [
    {
      id: "folder-operations",
      displayName: "Operations",
      childFolderCount: 1,
      childFolders: [
        {
          id: "folder-operations-reports",
          displayName: "Reports",
          childFolderCount: 0,
          childFolders: [],
        },
      ],
    },
    {
      id: "folder-vendor-updates",
      displayName: "Vendor Updates",
      childFolderCount: 0,
      childFolders: [],
    },
  ];
}

function flattenFolders(
  folders: ReturnType<typeof getDefaultFolders>,
  parentPath?: string,
): Array<ReturnType<typeof getDefaultFolders>[number] & { path: string }> {
  return folders.flatMap((folder) => {
    const path = parentPath
      ? `${parentPath}${FOLDER_SEPARATOR}${folder.displayName}`
      : folder.displayName;

    return [{ ...folder, path }, ...flattenFolders(folder.childFolders, path)];
  });
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
