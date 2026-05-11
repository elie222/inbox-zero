import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { startBulkCategorization } from "./start-bulk-categorization";

vi.mock("@/utils/prisma");

const {
  mockDeleteEmptyCategorizeSendersQueues,
  mockPublishToAiCategorizeSendersQueue,
  mockSaveCategorizationTotalItems,
  mockGetCategorizationProgress,
  mockGetCategorizationStatusSnapshot,
  mockDeleteCategorizationProgress,
  mockGetUncategorizedSenders,
  mockLoadEmails,
} = vi.hoisted(() => ({
  mockDeleteEmptyCategorizeSendersQueues: vi.fn(),
  mockPublishToAiCategorizeSendersQueue: vi.fn(),
  mockSaveCategorizationTotalItems: vi.fn(),
  mockGetCategorizationProgress: vi.fn(),
  mockGetCategorizationStatusSnapshot: vi.fn(),
  mockDeleteCategorizationProgress: vi.fn(),
  mockGetUncategorizedSenders: vi.fn(),
  mockLoadEmails: vi.fn(),
}));

vi.mock("@/utils/upstash/categorize-senders", () => ({
  deleteEmptyCategorizeSendersQueues: (
    ...args: Parameters<typeof mockDeleteEmptyCategorizeSendersQueues>
  ) => mockDeleteEmptyCategorizeSendersQueues(...args),
  publishToAiCategorizeSendersQueue: (
    ...args: Parameters<typeof mockPublishToAiCategorizeSendersQueue>
  ) => mockPublishToAiCategorizeSendersQueue(...args),
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  saveCategorizationTotalItems: (
    ...args: Parameters<typeof mockSaveCategorizationTotalItems>
  ) => mockSaveCategorizationTotalItems(...args),
  getCategorizationProgress: (
    ...args: Parameters<typeof mockGetCategorizationProgress>
  ) => mockGetCategorizationProgress(...args),
  getCategorizationStatusSnapshot: (
    ...args: Parameters<typeof mockGetCategorizationStatusSnapshot>
  ) => mockGetCategorizationStatusSnapshot(...args),
  deleteCategorizationProgress: (
    ...args: Parameters<typeof mockDeleteCategorizationProgress>
  ) => mockDeleteCategorizationProgress(...args),
}));

vi.mock(
  "@/app/api/user/categorize/senders/uncategorized/get-uncategorized-senders",
  () => ({
    getUncategorizedSenders: (
      ...args: Parameters<typeof mockGetUncategorizedSenders>
    ) => mockGetUncategorizedSenders(...args),
  }),
);

vi.mock("@/utils/actions/stats-loading", () => ({
  loadEmails: (...args: Parameters<typeof mockLoadEmails>) =>
    mockLoadEmails(...args),
}));

const logger = createTestLogger();

describe("startBulkCategorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.category.createMany.mockResolvedValue({ count: 0 } as never);
    prisma.emailAccount.update.mockResolvedValue({ id: "account-1" } as never);

    mockDeleteEmptyCategorizeSendersQueues.mockResolvedValue(undefined);
    mockPublishToAiCategorizeSendersQueue.mockResolvedValue(undefined);
    mockSaveCategorizationTotalItems.mockResolvedValue(undefined);
    mockGetCategorizationProgress.mockResolvedValue(null);
    mockGetCategorizationStatusSnapshot.mockImplementation((progress) => {
      if (!progress) {
        return {
          status: "idle",
          totalItems: 0,
          completedItems: 0,
          remainingItems: 0,
          message: "Sender categorization has not started.",
        };
      }

      const remainingItems = Math.max(
        progress.totalItems - progress.completedItems,
        0,
      );

      return {
        status: progress.status,
        totalItems: progress.totalItems,
        completedItems: progress.completedItems,
        remainingItems,
        message:
          progress.status === "completed"
            ? `Sender categorization completed for ${progress.completedItems} senders.`
            : `Categorizing senders: ${progress.completedItems} of ${progress.totalItems} completed.`,
      };
    });
    mockDeleteCategorizationProgress.mockResolvedValue(undefined);
    mockLoadEmails.mockResolvedValue({
      pages: 1,
      loadedAfterMessages: 0,
      loadedBeforeMessages: 0,
      hasMoreAfter: false,
      hasMoreBefore: false,
    });
  });

  it("loads more email history and only queues newly discovered senders", async () => {
    mockGetCategorizationProgress
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        totalItems: 2,
        completedItems: 0,
        status: "running",
        startedAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      });

    mockGetUncategorizedSenders
      .mockResolvedValueOnce({
        uncategorizedSenders: [{ email: "first@example.com", name: "First" }],
      })
      .mockResolvedValueOnce({
        uncategorizedSenders: [
          { email: "first@example.com", name: "First" },
          { email: "second@example.com", name: "Second" },
        ],
      });

    mockLoadEmails
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 20,
        hasMoreAfter: false,
        hasMoreBefore: true,
      })
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 0,
        hasMoreAfter: false,
        hasMoreBefore: false,
      });

    const result = await startBulkCategorization({
      emailAccountId: "account-1",
      emailProvider: {} as never,
      logger,
    });

    expect(mockLoadEmails).toHaveBeenCalledTimes(2);
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-1",
      senders: [{ email: "first@example.com", name: "First" }],
    });
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-1",
      senders: [{ email: "second@example.com", name: "Second" }],
    });
    expect(result).toMatchObject({
      started: true,
      alreadyRunning: false,
      totalQueuedSenders: 2,
      progress: {
        status: "running",
        totalItems: 2,
        completedItems: 0,
        remainingItems: 2,
      },
    });
  });

  it("returns the existing run when sender categorization is already running", async () => {
    mockGetCategorizationProgress.mockResolvedValueOnce({
      totalItems: 12,
      completedItems: 5,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });

    const result = await startBulkCategorization({
      emailAccountId: "account-1",
      emailProvider: {} as never,
      logger,
    });

    expect(prisma.category.createMany).not.toHaveBeenCalled();
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(mockPublishToAiCategorizeSendersQueue).not.toHaveBeenCalled();
    expect(mockLoadEmails).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      started: false,
      alreadyRunning: true,
      totalQueuedSenders: 12,
      progress: {
        status: "running",
        totalItems: 12,
        completedItems: 5,
        remainingItems: 7,
      },
    });
  });

  it("returns a no-work result when categorization exhausts the available email history", async () => {
    mockGetUncategorizedSenders.mockResolvedValue({
      uncategorizedSenders: [],
    });

    const result = await startBulkCategorization({
      emailAccountId: "account-1",
      emailProvider: {} as never,
      logger,
    });

    expect(mockLoadEmails).toHaveBeenCalledOnce();
    expect(mockPublishToAiCategorizeSendersQueue).not.toHaveBeenCalled();
    expect(result).toEqual({
      started: false,
      alreadyRunning: false,
      totalQueuedSenders: 0,
      autoCategorizeSenders: true,
      progress: {
        status: "completed",
        totalItems: 0,
        completedItems: 0,
        remainingItems: 0,
        message: "No uncategorized senders to categorize.",
      },
    });
  });

  it("dedupes queued senders case-insensitively across sync passes", async () => {
    mockGetCategorizationProgress
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        totalItems: 2,
        completedItems: 0,
        status: "running",
        startedAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      });

    mockGetUncategorizedSenders
      .mockResolvedValueOnce({
        uncategorizedSenders: [{ email: "Sender@example.com", name: "Sender" }],
      })
      .mockResolvedValueOnce({
        uncategorizedSenders: [
          { email: " sender@example.com ", name: "Sender duplicate" },
          { email: "second@example.com", name: "Second" },
        ],
      });

    mockLoadEmails
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 10,
        hasMoreAfter: false,
        hasMoreBefore: true,
      })
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 0,
        hasMoreAfter: false,
        hasMoreBefore: false,
      });

    await startBulkCategorization({
      emailAccountId: "account-1",
      emailProvider: {} as never,
      logger,
    });

    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-1",
      senders: [{ email: "Sender@example.com", name: "Sender" }],
    });
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-1",
      senders: [{ email: "second@example.com", name: "Second" }],
    });
  });
});
