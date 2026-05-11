import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/prisma";
import { processProviderHistory } from "@/utils/webhook/process-history";
import { processHistoryForUser as processGoogleHistoryForUser } from "@/app/api/google/webhook/process-history";
import { processHistoryForUser as processOutlookHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { backfillRecentOutlookMessages } from "@/utils/outlook/backfill-recent-messages";

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/app/api/google/webhook/process-history", () => ({
  processHistoryForUser: vi.fn(),
}));
vi.mock("@/app/api/outlook/webhook/process-history", () => ({
  processHistoryForUser: vi.fn(),
}));
vi.mock("@/utils/outlook/backfill-recent-messages", () => ({
  backfillRecentOutlookMessages: vi.fn(),
}));

describe("processProviderHistory", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles recent Outlook messages when no specific resource data is provided", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "email-account-id",
    } as any);
    vi.mocked(backfillRecentOutlookMessages).mockResolvedValue({
      processedCount: 2,
      candidateCount: 3,
    });

    await processProviderHistory({
      provider: "microsoft",
      emailAddress: "user@example.com",
      subscriptionId: "subscription-id",
      logger,
    });

    expect(backfillRecentOutlookMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        emailAddress: "user@example.com",
        subscriptionId: "subscription-id",
        maxMessages: 100,
      }),
    );
    expect(processOutlookHistoryForUser).not.toHaveBeenCalled();
  });

  it("uses the direct Outlook history path when resource data is provided", async () => {
    await processProviderHistory({
      provider: "microsoft",
      emailAddress: "user@example.com",
      subscriptionId: "subscription-id",
      resourceData: {
        id: "message-id",
        conversationId: "thread-id",
      },
      logger,
    });

    expect(processOutlookHistoryForUser).toHaveBeenCalledWith({
      subscriptionId: "subscription-id",
      resourceData: {
        id: "message-id",
        conversationId: "thread-id",
      },
      logger,
    });
    expect(backfillRecentOutlookMessages).not.toHaveBeenCalled();
  });

  it("keeps the Google history path unchanged", async () => {
    await processProviderHistory({
      provider: "google",
      emailAddress: "user@example.com",
      historyId: 123,
      startHistoryId: 100,
      logger,
    });

    expect(processGoogleHistoryForUser).toHaveBeenCalledWith(
      {
        emailAddress: "user@example.com",
        historyId: 123,
      },
      {
        startHistoryId: "100",
      },
      logger,
    );
  });
});
