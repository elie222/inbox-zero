import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getCategoryOverview } from "./get-category-overview";

vi.mock("@/utils/prisma");

const { mockGetCategorizationProgress, mockGetCategorizationStatusSnapshot } =
  vi.hoisted(() => ({
    mockGetCategorizationProgress: vi.fn(),
    mockGetCategorizationStatusSnapshot: vi.fn(),
  }));

vi.mock("@/utils/redis/categorization-progress", () => ({
  getCategorizationProgress: (
    ...args: Parameters<typeof mockGetCategorizationProgress>
  ) => mockGetCategorizationProgress(...args),
  getCategorizationStatusSnapshot: (
    ...args: Parameters<typeof mockGetCategorizationStatusSnapshot>
  ) => mockGetCategorizationStatusSnapshot(...args),
}));

describe("getCategoryOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCategorizationProgress.mockResolvedValue(null);
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "idle",
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      message: "Sender categorization has not started.",
    });
  });

  it("returns category counts, sample senders, uncategorized count, and progress", async () => {
    prisma.category.findMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Newsletters",
        description: "Recurring updates",
        emailSenders: [
          { email: "first@example.com", name: "First" },
          { email: "second@example.com", name: null },
        ],
        _count: { emailSenders: 2 },
      },
      {
        id: "cat-2",
        name: "Receipts",
        description: null,
        emailSenders: [],
        _count: { emailSenders: 0 },
      },
    ] as never);
    prisma.newsletter.count.mockResolvedValue(3);
    prisma.emailAccount.findUnique.mockResolvedValue({
      autoCategorizeSenders: true,
    } as never);
    mockGetCategorizationProgress.mockResolvedValueOnce({
      totalItems: 10,
      completedItems: 4,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValueOnce({
      status: "running",
      totalItems: 10,
      completedItems: 4,
      remainingItems: 6,
      message: "Categorizing senders: 4 of 10 completed.",
    });

    const result = await getCategoryOverview({ emailAccountId: "account-1" });

    expect(result).toEqual({
      autoCategorizeSenders: true,
      categorization: {
        status: "running",
        totalItems: 10,
        completedItems: 4,
        remainingItems: 6,
        message: "Categorizing senders: 4 of 10 completed.",
      },
      categorizedSenderCount: 2,
      uncategorizedSenderCount: 3,
      categories: [
        {
          id: "cat-1",
          name: "Newsletters",
          description: "Recurring updates",
          senderCount: 2,
          sampleSenders: [
            { email: "first@example.com", name: "First" },
            { email: "second@example.com", name: null },
          ],
        },
        {
          id: "cat-2",
          name: "Receipts",
          description: null,
          senderCount: 0,
          sampleSenders: [],
        },
      ],
    });
  });

  it("handles accounts without categories yet", async () => {
    prisma.category.findMany.mockResolvedValue([] as never);
    prisma.newsletter.count.mockResolvedValue(7);
    prisma.emailAccount.findUnique.mockResolvedValue({
      autoCategorizeSenders: false,
    } as never);

    const result = await getCategoryOverview({ emailAccountId: "account-1" });

    expect(result).toEqual({
      autoCategorizeSenders: false,
      categorization: {
        status: "idle",
        totalItems: 0,
        completedItems: 0,
        remainingItems: 0,
        message: "Sender categorization has not started.",
      },
      categorizedSenderCount: 0,
      uncategorizedSenderCount: 7,
      categories: [],
    });
    expect(prisma.newsletter.findMany).not.toHaveBeenCalled();
  });
});
