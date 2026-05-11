import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getEmailAccount } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import { createScopedLogger } from "@/utils/logger";
import { processFilingReply } from "./handle-filing-reply";

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/document-filing/parse-filing-reply", () => ({
  aiParseFilingReply: vi.fn(),
}));
vi.mock("@/utils/ai/content-sanitizer", () => ({
  emailToContentForAI: vi.fn().mockReturnValue("approve"),
}));

import { aiParseFilingReply } from "@/utils/ai/document-filing/parse-filing-reply";

const logger = createScopedLogger("handle-filing-reply-test");

const emailAccountId = "email-account-id";
const userEmail = "user@example.com";

describe("processFilingReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiParseFilingReply).mockResolvedValue({
      action: "approve",
      reply: null,
      folderPath: null,
    } as any);
  });

  it("finds filing by source messageId when notificationMessageId is null", async () => {
    const filingRow = {
      id: "filing-1",
      filename: "receipt.pdf",
      folderPath: "Receipts",
      fileId: "file-1",
      status: "FILED",
      wasCorrected: false,
      originalPath: null,
      messageId: "source-123",
      notificationMessageId: null,
      emailAccountId,
      driveConnection: { id: "conn-1", provider: "outlook" } as any,
    };

    prisma.documentFiling.findFirst.mockImplementation(async (args: any) => {
      const messageIdIn: string[] = args?.where?.messageId?.in ?? [];
      return messageIdIn.includes(filingRow.messageId)
        ? (filingRow as any)
        : null;
    });

    const emailProvider = createMockEmailProvider({
      getThreadMessages: vi
        .fn()
        .mockResolvedValue([{ id: "source-123" }, { id: "reply-456" }]),
      isSentMessage: vi.fn().mockReturnValue(true),
    });

    await processFilingReply({
      emailAccountId,
      userEmail,
      message: getMockParsedMessage({
        id: "reply-456",
        threadId: "thread-1",
        headers: { from: userEmail, to: userEmail, subject: "Re: Filed" },
      }),
      emailProvider,
      emailAccount: getEmailAccount({ id: emailAccountId }),
      logger,
    });

    expect(prisma.documentFiling.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "filing-1" },
        data: expect.objectContaining({ feedbackPositive: true }),
      }),
    );
  });
});
