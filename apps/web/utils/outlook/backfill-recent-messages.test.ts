import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { backfillRecentOutlookMessages } from "@/utils/outlook/backfill-recent-messages";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";

vi.mock("@/utils/prisma", () => ({
  default: {
    emailMessage: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/app/api/outlook/webhook/process-history", () => ({
  processHistoryForUser: vi.fn(),
}));

describe("backfillRecentOutlookMessages", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes unseen recent messages oldest first", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessagesWithPagination: vi
        .fn()
        .mockResolvedValueOnce({
          messages: [
            {
              id: "newest-message",
              threadId: "thread-newest",
              date: "2026-04-16T09:00:00.000Z",
            },
            {
              id: "existing-message",
              threadId: "thread-existing",
              date: "2026-04-16T08:00:00.000Z",
            },
          ],
          nextPageToken: "next-page",
        })
        .mockResolvedValueOnce({
          messages: [
            {
              id: "oldest-message",
              threadId: "thread-oldest",
              date: "2026-04-16T07:00:00.000Z",
            },
          ],
        }),
    } as any);
    vi.mocked(prisma.emailMessage.findMany).mockResolvedValue([
      { messageId: "existing-message" },
    ] as any);

    const result = await backfillRecentOutlookMessages({
      emailAccountId: "email-account-id",
      emailAddress: "user@example.com",
      subscriptionId: "subscription-id",
      after: new Date("2026-04-15T00:00:00.000Z"),
      maxMessages: 5,
      logger,
    });

    expect(result).toEqual({ processedCount: 2, candidateCount: 3 });
    expect(processHistoryForUser).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        emailAddress: "user@example.com",
        subscriptionId: "subscription-id",
        resourceData: {
          id: "oldest-message",
          conversationId: "thread-oldest",
        },
      }),
    );
    expect(processHistoryForUser).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        emailAddress: "user@example.com",
        subscriptionId: "subscription-id",
        resourceData: {
          id: "newest-message",
          conversationId: "thread-newest",
        },
      }),
    );
  });

  it("returns without processing when there are no recent messages", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
      }),
    } as any);

    const result = await backfillRecentOutlookMessages({
      emailAccountId: "email-account-id",
      emailAddress: "user@example.com",
      after: new Date("2026-04-15T00:00:00.000Z"),
      maxMessages: 5,
      logger,
    });

    expect(result).toEqual({ processedCount: 0, candidateCount: 0 });
    expect(prisma.emailMessage.findMany).not.toHaveBeenCalled();
    expect(processHistoryForUser).not.toHaveBeenCalled();
  });
});
