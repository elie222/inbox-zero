import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import type { RecordedToolCall } from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  cloneEmailAccountForProvider,
  getFirstSearchInboxCall,
  hasSearchBeforeFirstWrite,
  inboxWorkflowProviders,
  mockSearchMessages,
  runAssistantChat,
  setupInboxWorkflowEval,
  shouldRunEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-sender-category-cleanup.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-sender-category-cleanup.test.ts

const evalReporter = createEvalReporter();

const hoisted = vi.hoisted(() => ({
  mockGetCategoryOverview: vi.fn(),
  mockStartBulkCategorization: vi.fn(),
  mockArchiveCategory: vi.fn(),
  mockGetCategorizationProgress: vi.fn(),
  mockGetCategorizationStatusSnapshot: vi.fn((progress: unknown) =>
    buildStatusSnapshotFromProgress(progress),
  ),
}));

vi.mock("@/utils/categorize/senders/get-category-overview", () => ({
  getCategoryOverview: hoisted.mockGetCategoryOverview,
}));

vi.mock("@/utils/categorize/senders/start-bulk-categorization", () => ({
  startBulkCategorization: hoisted.mockStartBulkCategorization,
}));

vi.mock("@/utils/categorize/senders/archive-category", () => ({
  archiveCategory: hoisted.mockArchiveCategory,
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  getCategorizationProgress: hoisted.mockGetCategorizationProgress,
  getCategorizationStatusSnapshot: hoisted.mockGetCategorizationStatusSnapshot,
}));

describe.runIf(shouldRunEval)(
  "Eval: assistant chat sender category cleanup",
  () => {
    setupInboxWorkflowEval();

    beforeEach(() => {
      hoisted.mockGetCategoryOverview.mockResolvedValue(
        buildReadyCategoryOverview(),
      );
      hoisted.mockStartBulkCategorization.mockResolvedValue(
        buildStartCategorizationResult(),
      );
      hoisted.mockArchiveCategory.mockResolvedValue(
        buildArchiveCategoryResult(),
      );
      hoisted.mockGetCategorizationProgress.mockResolvedValue(null);
      hoisted.mockGetCategorizationStatusSnapshot.mockImplementation(
        (progress: unknown) => buildStatusSnapshotFromProgress(progress),
      );
    });

    describeEvalMatrix(
      "assistant-chat sender category cleanup",
      (model, emailAccount) => {
        test.each(inboxWorkflowProviders)(
          "generic cleanup stays search-led instead of entering sender categorization [$label]",
          async ({ provider, label }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-cleanup-1",
                  threadId: "thread-cleanup-1",
                  from: "founder@client.example",
                  subject: "Need approval today",
                  snippet: "Can you confirm the revised rollout before 3pm?",
                  labelIds: ["UNREAD"],
                }),
                getMockMessage({
                  id: "msg-cleanup-2",
                  threadId: "thread-cleanup-2",
                  from: "updates@vendor.example",
                  subject: "Weekly product digest",
                  snippet: "Here is the latest vendor platform update.",
                  labelIds: [],
                }),
                getMockMessage({
                  id: "msg-cleanup-3",
                  threadId: "thread-cleanup-3",
                  from: "receipts@bank.example",
                  subject: "Your monthly receipt",
                  snippet: "Receipt for your March statement.",
                  labelIds: [],
                }),
              ],
              nextPageToken: undefined,
            });

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              inboxStats: { total: 188, unread: 9 },
              messages: [
                {
                  role: "user",
                  content: "Clean up my inbox.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);
            const pass =
              !!searchCall &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              !usesSenderCategoryExecutionPath(toolCalls);

            evalReporter.record({
              testName: `generic cleanup stays search-led (${label})`,
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "explicit category cleanup uses category tools when coverage is ready [$label]",
          async ({ provider, label }) => {
            hoisted.mockGetCategoryOverview.mockResolvedValueOnce(
              buildReadyCategoryOverview(),
            );
            hoisted.mockArchiveCategory.mockResolvedValueOnce(
              buildArchiveCategoryResult(),
            );

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              messages: [
                {
                  role: "user",
                  content: "Archive the Newsletters category.",
                },
              ],
            });

            const overviewCall = getFirstToolCallIndex(
              toolCalls,
              "getSenderCategoryOverview",
            );
            const manageCall =
              getFirstMatchingManageSenderCategoryCall(toolCalls);
            const pass =
              overviewCall >= 0 &&
              !!manageCall &&
              overviewCall < manageCall.index &&
              referencesNewslettersCategory(manageCall.input) &&
              !hasToolCall(toolCalls, "searchInbox") &&
              !hasToolCall(toolCalls, "startSenderCategorization") &&
              !hasToolCall(toolCalls, "getSenderCategorizationStatus");

            evalReporter.record({
              testName: `ready category cleanup uses category tools (${label})`,
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "missing category coverage starts categorization before any search fallback [$label]",
          async ({ provider, label }) => {
            hoisted.mockGetCategoryOverview.mockResolvedValue(
              buildUnreadyCategoryOverview(),
            );
            hoisted.mockStartBulkCategorization.mockResolvedValueOnce(
              buildStartCategorizationResult(),
            );
            hoisted.mockGetCategorizationProgress.mockResolvedValue(
              buildRunningCategorizationProgress(),
            );

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              messages: [
                {
                  role: "user",
                  content: "Archive the Newsletters category.",
                },
              ],
            });

            const overviewCall = getFirstToolCallIndex(
              toolCalls,
              "getSenderCategoryOverview",
            );
            const startCall = getFirstToolCallIndex(
              toolCalls,
              "startSenderCategorization",
            );
            const statusCalls = getSenderCategorizationStatusCalls(toolCalls);
            const firstSearchCall = getFirstToolCallIndex(
              toolCalls,
              "searchInbox",
            );
            const lastStatusCall = getLastToolCallIndex(
              toolCalls,
              "getSenderCategorizationStatus",
            );
            const pass =
              overviewCall >= 0 &&
              startCall > overviewCall &&
              !hasToolCall(toolCalls, "manageSenderCategory") &&
              statusCalls.length <= 3 &&
              statusCalls.every((toolCall) => toolCall.input.waitMs <= 1500) &&
              (firstSearchCall < 0 ||
                (firstSearchCall > startCall &&
                  (lastStatusCall < 0 || firstSearchCall > lastStatusCall)));

            evalReporter.record({
              testName: `missing coverage starts categorization before fallback (${label})`,
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
  },
);

type ManageSenderCategoryInput = {
  action: "archive_category";
  categoryId?: string | null;
  categoryName?: string | null;
};

type SenderCategorizationStatusInput = {
  waitMs: number;
};

function hasToolCall(toolCalls: RecordedToolCall[], toolName: string) {
  return toolCalls.some((toolCall) => toolCall.toolName === toolName);
}

function getFirstToolCallIndex(
  toolCalls: RecordedToolCall[],
  toolName: string,
) {
  return toolCalls.findIndex((toolCall) => toolCall.toolName === toolName);
}

function getLastToolCallIndex(toolCalls: RecordedToolCall[], toolName: string) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    if (toolCalls[index]?.toolName === toolName) {
      return index;
    }
  }

  return -1;
}

function usesSenderCategoryExecutionPath(toolCalls: RecordedToolCall[]) {
  return toolCalls.some((toolCall) =>
    [
      "startSenderCategorization",
      "getSenderCategorizationStatus",
      "manageSenderCategory",
    ].includes(toolCall.toolName),
  );
}

function getFirstMatchingManageSenderCategoryCall(
  toolCalls: RecordedToolCall[],
) {
  for (let index = 0; index < toolCalls.length; index += 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== "manageSenderCategory") continue;
    if (!isManageSenderCategoryInput(toolCall.input)) continue;

    return {
      index,
      input: toolCall.input,
    };
  }

  return null;
}

function getSenderCategorizationStatusCalls(toolCalls: RecordedToolCall[]) {
  return toolCalls.filter(
    (
      toolCall,
    ): toolCall is RecordedToolCall & {
      input: SenderCategorizationStatusInput;
    } =>
      toolCall.toolName === "getSenderCategorizationStatus" &&
      isSenderCategorizationStatusInput(toolCall.input),
  );
}

function isManageSenderCategoryInput(
  input: unknown,
): input is ManageSenderCategoryInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    categoryId?: unknown;
    categoryName?: unknown;
  };

  return (
    value.action === "archive_category" &&
    (typeof value.categoryId === "string" ||
      typeof value.categoryName === "string")
  );
}

function isSenderCategorizationStatusInput(
  input: unknown,
): input is SenderCategorizationStatusInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { waitMs?: unknown }).waitMs === "number"
  );
}

function referencesNewslettersCategory(input: ManageSenderCategoryInput) {
  return (
    input.categoryId === "cat-newsletters" ||
    input.categoryName?.trim().toLowerCase() === "newsletters"
  );
}

function buildReadyCategoryOverview() {
  return {
    autoCategorizeSenders: true,
    categorization: {
      status: "completed" as const,
      totalItems: 12,
      completedItems: 12,
      remainingItems: 0,
      message: "Sender categorization completed for 12 senders.",
    },
    categorizedSenderCount: 18,
    uncategorizedSenderCount: 1,
    categories: [
      {
        id: "cat-newsletters",
        name: "Newsletters",
        description: "Recurring newsletters and digests.",
        senderCount: 12,
        sampleSenders: [
          { email: "digest@newsletter.example", name: "Daily Digest" },
          { email: "weekly@newsletter.example", name: "Weekly Roundup" },
        ],
      },
      {
        id: "cat-receipts",
        name: "Receipts",
        description: "Receipts and purchase confirmations.",
        senderCount: 6,
        sampleSenders: [
          { email: "receipts@bank.example", name: "Bank Receipts" },
        ],
      },
    ],
  };
}

function buildUnreadyCategoryOverview() {
  return {
    autoCategorizeSenders: false,
    categorization: {
      status: "idle" as const,
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      message: "Sender categorization has not started.",
    },
    categorizedSenderCount: 0,
    uncategorizedSenderCount: 48,
    categories: [],
  };
}

function buildStartCategorizationResult() {
  return {
    started: true,
    alreadyRunning: false,
    totalQueuedSenders: 48,
    autoCategorizeSenders: true,
    progress: {
      status: "running" as const,
      totalItems: 48,
      completedItems: 0,
      remainingItems: 48,
      message: "Categorizing senders: 0 of 48 completed.",
    },
  };
}

function buildRunningCategorizationProgress() {
  return {
    totalItems: 48,
    completedItems: 10,
    status: "running" as const,
    startedAt: "2026-04-17T10:00:00.000Z",
    updatedAt: "2026-04-17T10:00:01.000Z",
  };
}

function buildArchiveCategoryResult() {
  return {
    success: true,
    action: "archive_category" as const,
    category: { id: "cat-newsletters", name: "Newsletters" },
    sendersCount: 12,
    senders: ["digest@newsletter.example", "weekly@newsletter.example"],
    message: 'Archived mail from 12 senders in "Newsletters".',
  };
}

function buildStatusSnapshotFromProgress(progress: unknown) {
  if (!progress || typeof progress !== "object") {
    return {
      status: "idle" as const,
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      message: "Sender categorization has not started.",
    };
  }

  const value = progress as {
    totalItems?: unknown;
    completedItems?: unknown;
    status?: unknown;
  };
  const totalItems =
    typeof value.totalItems === "number" ? value.totalItems : 0;
  const completedItems =
    typeof value.completedItems === "number" ? value.completedItems : 0;
  const remainingItems = Math.max(totalItems - completedItems, 0);

  if (value.status === "completed" || remainingItems === 0) {
    return {
      status: "completed" as const,
      totalItems,
      completedItems,
      remainingItems: 0,
      message:
        totalItems > 0
          ? `Sender categorization completed for ${completedItems} senders.`
          : "Sender categorization completed.",
    };
  }

  return {
    status: "running" as const,
    totalItems,
    completedItems,
    remainingItems,
    message: `Categorizing senders: ${completedItems} of ${totalItems} completed.`,
  };
}
