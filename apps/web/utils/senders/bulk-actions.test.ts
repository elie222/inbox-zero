import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";

const { mockUnsubscribe, mockSetStatus, mockSource } = vi.hoisted(() => ({
  mockUnsubscribe: vi.fn(),
  mockSetStatus: vi.fn(),
  mockSource: vi.fn(),
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribe,
  setSenderStatusWithAutoArchive: mockSetStatus,
}));
vi.mock("@/utils/senders/source", () => ({
  getSenderUnsubscribeSource: mockSource,
}));

import { applySenderBulkActions } from "./bulk-actions";

const logger = createTestLogger();
const emailProvider = { name: "google" };

describe("applySenderBulkActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSource.mockResolvedValue({
      unsubscribeLink: "https://example.com/unsub",
    });
    mockSetStatus.mockImplementation(
      async ({
        senderEmail,
        status,
      }: {
        senderEmail: string;
        status: NewsletterStatus | null;
      }) => ({ senderEmail, status, autoArchived: false }),
    );
  });

  it("unsubscribes with the resolved source", async () => {
    mockUnsubscribe.mockResolvedValue({
      senderEmail: "news@example.com",
      status: NewsletterStatus.UNSUBSCRIBED,
      unsubscribe: { attempted: true, success: true, method: "post" },
    });

    await expect(
      applySenderBulkActions({
        actions: [{ senderEmail: "news@example.com", action: "unsubscribe" }],
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        logger,
      }),
    ).resolves.toEqual([
      {
        senderEmail: "news@example.com",
        ok: true,
        status: NewsletterStatus.UNSUBSCRIBED,
      },
    ]);
    expect(mockUnsubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        unsubscribeLink: "https://example.com/unsub",
      }),
    );
  });

  it("reports an unsuccessful unsubscribe", async () => {
    mockUnsubscribe.mockResolvedValue({
      senderEmail: "news@example.com",
      status: null,
      unsubscribe: {
        attempted: false,
        success: false,
        reason: "no_unsubscribe_url",
      },
    });

    await expect(
      applySenderBulkActions({
        actions: [{ senderEmail: "news@example.com", action: "unsubscribe" }],
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        logger,
      }),
    ).resolves.toEqual([
      {
        senderEmail: "news@example.com",
        ok: false,
        status: null,
        reason: "no_unsubscribe_url",
      },
    ]);
  });

  it("continues after one sender fails", async () => {
    mockSetStatus
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce({
        senderEmail: "keep@example.com",
        status: NewsletterStatus.APPROVED,
        autoArchived: false,
      });

    await expect(
      applySenderBulkActions({
        actions: [
          { senderEmail: "bad@example.com", action: "auto_archived" },
          { senderEmail: "keep@example.com", action: "approved" },
        ],
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        logger,
      }),
    ).resolves.toEqual([
      {
        senderEmail: "bad@example.com",
        ok: false,
        status: null,
        reason: "request_failed",
      },
      {
        senderEmail: "keep@example.com",
        ok: true,
        status: NewsletterStatus.APPROVED,
      },
    ]);
  });

  it("sets auto-archive, approve, and clear", async () => {
    const results = await applySenderBulkActions({
      actions: [
        { senderEmail: "a@example.com", action: "auto_archived" },
        { senderEmail: "b@example.com", action: "approved" },
        { senderEmail: "c@example.com", action: "clear" },
      ],
      emailAccountId: "account-1",
      emailProvider: emailProvider as never,
      logger,
    });

    expect(results.map((result) => result.status)).toEqual([
      NewsletterStatus.AUTO_ARCHIVED,
      NewsletterStatus.APPROVED,
      null,
    ]);
  });
});
