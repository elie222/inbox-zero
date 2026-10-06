import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";

const { mockUnsubscribe, mockSetStatus, mockSource, mockReserve, mockRelease } =
  vi.hoisted(() => ({
    mockUnsubscribe: vi.fn(),
    mockSetStatus: vi.fn(),
    mockSource: vi.fn(),
    mockReserve: vi.fn(),
    mockRelease: vi.fn(),
  }));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribe,
  setSenderStatusWithAutoArchive: mockSetStatus,
}));
vi.mock("@/utils/senders/source", () => ({
  getSenderUnsubscribeSource: mockSource,
}));
vi.mock("@/utils/premium/unsubscribe-credits", () => ({
  reserveUnsubscribeCredit: mockReserve,
  releaseUnsubscribeCreditReservation: mockRelease,
}));

import {
  applySenderBulkActions,
  senderActionsRequireUnsubscribeAccess,
} from "./bulk-actions";

const logger = createTestLogger();
const emailProvider = { name: "google" };

describe("applySenderBulkActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSource.mockResolvedValue({
      unsubscribeLink: "https://example.com/unsub",
    });
    mockReserve.mockResolvedValue("reserved");
    mockRelease.mockResolvedValue(undefined);
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

  it("unsubscribes with the resolved source and spends a credit on success", async () => {
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
        userId: "user-1",
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
    expect(mockReserve).toHaveBeenCalledWith({ userId: "user-1" });
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockReserve.mock.invocationCallOrder[0]).toBeLessThan(
      mockUnsubscribe.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reports an unsuccessful unsubscribe without spending a credit", async () => {
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
        userId: "user-1",
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
    expect(mockRelease).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", reservation: "reserved" }),
    );
  });

  it("stops a credit action once the reservation is denied", async () => {
    mockReserve.mockResolvedValue("denied");

    await expect(
      applySenderBulkActions({
        actions: [
          { senderEmail: "news@example.com", action: "unsubscribe" },
          { senderEmail: "old@example.com", action: "auto_archived" },
        ],
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        userId: "user-1",
        logger,
      }),
    ).resolves.toEqual([
      {
        senderEmail: "news@example.com",
        ok: false,
        status: null,
        reason: "unsubscribe_allowance",
      },
      {
        senderEmail: "old@example.com",
        ok: false,
        status: null,
        reason: "unsubscribe_allowance",
      },
    ]);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
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
        userId: "user-1",
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
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockReserve).toHaveBeenCalledTimes(1);
  });

  it("spends a credit for auto-archive and not for approve or clear", async () => {
    const results = await applySenderBulkActions({
      actions: [
        { senderEmail: "a@example.com", action: "auto_archived" },
        { senderEmail: "b@example.com", action: "approved" },
        { senderEmail: "c@example.com", action: "clear" },
      ],
      emailAccountId: "account-1",
      emailProvider: emailProvider as never,
      userId: "user-1",
      logger,
    });

    expect(results.map((result) => result.status)).toEqual([
      NewsletterStatus.AUTO_ARCHIVED,
      NewsletterStatus.APPROVED,
      null,
    ]);
    expect(mockReserve).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("requires allowance only for unsubscribe and auto-archive", () => {
    expect(
      senderActionsRequireUnsubscribeAccess([
        { action: "approved" },
        { action: "clear" },
      ]),
    ).toBe(false);
    expect(
      senderActionsRequireUnsubscribeAccess([{ action: "unsubscribe" }]),
    ).toBe(true);
    expect(
      senderActionsRequireUnsubscribeAccess([{ action: "auto_archived" }]),
    ).toBe(true);
  });
});
