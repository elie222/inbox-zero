import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
import { createTestLogger } from "@/__tests__/helpers";
import {
  sendAskNotification,
  sendFiledNotification,
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
});
