import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
import { createTestLogger } from "@/__tests__/helpers";
import {
  sendAskNotification,
  sendFiledNotification,
  sendFilingNotifications,
} from "./filing-notifications";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

const sourceMessage = {
  headerMessageId: "<original@example.com>",
  threadId: "thread-1",
};

const filingId = "filing-1";

describe("filing-notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.documentFiling.findUnique.mockResolvedValue({
      id: filingId,
      filename: "receipt.pdf",
      folderPath: "Receipts",
      reasoning: null,
      driveConnection: { provider: "outlook" },
    } as any);
  });

  describe("sendFiledNotification", () => {
    it("does not write an empty notificationMessageId when provider returns none", async () => {
      const emailProvider = createMockEmailProvider({
        sendEmailWithHtml: vi
          .fn()
          .mockResolvedValue({ messageId: "", threadId: "thread-1" }),
      });

      await sendFiledNotification({
        emailProvider,
        userEmail: "user@example.com",
        filingId,
        sourceMessage,
        logger,
      });

      const updateCall = prisma.documentFiling.update.mock.calls[0]?.[0] as
        | { data: { notificationMessageId?: string | null } }
        | undefined;
      expect(updateCall?.data.notificationMessageId ?? null).not.toBe("");
    });

    it("writes the returned messageId when provider returns one", async () => {
      const emailProvider = createMockEmailProvider({
        sendEmailWithHtml: vi
          .fn()
          .mockResolvedValue({ messageId: "sent-123", threadId: "thread-1" }),
      });

      await sendFiledNotification({
        emailProvider,
        userEmail: "user@example.com",
        filingId,
        sourceMessage,
        logger,
      });

      expect(prisma.documentFiling.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: filingId },
          data: expect.objectContaining({
            notificationMessageId: "sent-123",
          }),
        }),
      );
    });
  });

  describe("sendAskNotification", () => {
    it("does not write an empty notificationMessageId when provider returns none", async () => {
      const emailProvider = createMockEmailProvider({
        sendEmailWithHtml: vi
          .fn()
          .mockResolvedValue({ messageId: "", threadId: "thread-1" }),
      });

      await sendAskNotification({
        emailProvider,
        userEmail: "user@example.com",
        filingId,
        sourceMessage,
        logger,
      });

      const updateCall = prisma.documentFiling.update.mock.calls[0]?.[0] as
        | { data: { notificationMessageId?: string | null } }
        | undefined;
      expect(updateCall?.data.notificationMessageId ?? null).not.toBe("");
    });
  });

  describe("sendFilingNotifications", () => {
    it("sends one summary email for multiple filings", async () => {
      prisma.documentFiling.findMany.mockResolvedValue([
        {
          id: "filing-1",
          filename: "first.pdf",
          folderPath: "Receipts",
          reasoning: null,
          status: "FILED",
          wasAsked: false,
          driveConnection: { provider: "google" },
        },
        {
          id: "filing-2",
          filename: "second.pdf",
          folderPath: "Invoices",
          reasoning: null,
          status: "FILED",
          wasAsked: false,
          driveConnection: { provider: "outlook" },
        },
      ] as any);
      const sendEmailWithHtml = vi
        .fn()
        .mockResolvedValue({ messageId: "sent-123", threadId: "thread-1" });
      const emailProvider = createMockEmailProvider({ sendEmailWithHtml });

      await sendFilingNotifications({
        emailProvider,
        userEmail: "user@example.com",
        filingIds: ["filing-1", "filing-2"],
        sourceMessage,
        logger,
      });

      expect(sendEmailWithHtml).toHaveBeenCalledOnce();
      expect(sendEmailWithHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "✓ Filed 2 documents",
          messageHtml: expect.stringMatching(/first\.pdf[\s\S]*second\.pdf/),
        }),
      );
      expect(prisma.documentFiling.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["filing-1", "filing-2"] } },
        data: { notificationSentAt: expect.any(Date) },
      });
      expect(prisma.documentFiling.update).toHaveBeenCalledWith({
        where: { id: "filing-1" },
        data: { notificationMessageId: "sent-123" },
      });
    });

    it("does not resend notifications for filings that were already notified", async () => {
      prisma.documentFiling.findMany.mockResolvedValue([]);
      const sendEmailWithHtml = vi.fn();
      const emailProvider = createMockEmailProvider({ sendEmailWithHtml });

      await sendFilingNotifications({
        emailProvider,
        userEmail: "user@example.com",
        filingIds: ["filing-1", "filing-2"],
        sourceMessage,
        logger,
      });

      expect(prisma.documentFiling.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ["filing-1", "filing-2"] },
            notificationSentAt: null,
          },
        }),
      );
      expect(sendEmailWithHtml).not.toHaveBeenCalled();
    });
  });
});
