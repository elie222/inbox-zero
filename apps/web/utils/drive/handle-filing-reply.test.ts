import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import type {
  DocumentFiling,
  DriveConnection,
} from "@/generated/prisma/client";
import { DocumentFilingStatus } from "@/generated/prisma/enums";
import { aiParseFilingReply } from "@/utils/ai/document-filing/parse-filing-reply";
import { processFilingReply } from "./handle-filing-reply";

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/document-filing/parse-filing-reply", () => ({
  aiParseFilingReply: vi.fn(),
}));
vi.mock("@/utils/ai/content-sanitizer", () => ({
  emailToContentForAI: vi.fn().mockReturnValue("Update the second document"),
}));

const logger = createTestLogger();
const emailAccountId = "email-account-id";
const userEmail = "user@example.com";

describe("processFilingReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiParseFilingReply).mockResolvedValue({
      actions: [],
      reply: "",
    });
  });

  it("applies a named action to the correct filing in a batch", async () => {
    const filings = getFilingBatch();
    prisma.documentFiling.findFirst.mockResolvedValue(filings[0]);
    prisma.documentFiling.findMany.mockResolvedValue(filings);
    vi.mocked(aiParseFilingReply).mockResolvedValue({
      actions: [{ filingId: "filing-2", action: "approve", folderPath: null }],
      reply: "",
    });

    await processFilingReply(getReplyParams());

    expect(prisma.documentFiling.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId,
          notificationMessageId: "notification-1",
        },
      }),
    );
    expect(prisma.documentFiling.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId, notificationBatchId: "batch-1" },
      }),
    );
    expect(aiParseFilingReply).toHaveBeenCalledWith(
      expect.objectContaining({
        filingContexts: [
          {
            id: "filing-1",
            filename: "first.pdf",
            currentFolder: "Receipts",
          },
          {
            id: "filing-2",
            filename: "second.pdf",
            currentFolder: "Invoices",
          },
        ],
      }),
    );
    expect(prisma.documentFiling.update).toHaveBeenCalledOnce();
    expect(prisma.documentFiling.update).toHaveBeenCalledWith({
      where: { id: "filing-2" },
      data: {
        feedbackPositive: true,
        feedbackAt: expect.any(Date),
      },
    });
  });

  it("applies multiple actions to their matching filings", async () => {
    const filings = getFilingBatch();
    prisma.documentFiling.findFirst.mockResolvedValue(filings[0]);
    prisma.documentFiling.findMany.mockResolvedValue(filings);
    vi.mocked(aiParseFilingReply).mockResolvedValue({
      actions: [
        { filingId: "filing-1", action: "approve", folderPath: null },
        { filingId: "filing-2", action: "approve", folderPath: null },
        { filingId: "filing-1", action: "undo", folderPath: null },
      ],
      reply: "",
    });

    await processFilingReply(getReplyParams());

    expect(prisma.documentFiling.update).toHaveBeenCalledTimes(2);
    expect(prisma.documentFiling.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: "filing-1" } }),
    );
    expect(prisma.documentFiling.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: "filing-2" } }),
    );
  });

  it("ignores actions for filings outside the notification batch", async () => {
    const filings = getFilingBatch();
    prisma.documentFiling.findFirst.mockResolvedValue(filings[0]);
    prisma.documentFiling.findMany.mockResolvedValue(filings);
    vi.mocked(aiParseFilingReply).mockResolvedValue({
      actions: [
        { filingId: "unrelated-filing", action: "approve", folderPath: null },
      ],
      reply: "",
    });

    await processFilingReply(getReplyParams());

    expect(prisma.documentFiling.update).not.toHaveBeenCalled();
  });

  it("limits legacy notifications without a batch ID to their anchor filing", async () => {
    const legacyFiling = {
      ...getFilingBatch()[0],
      notificationBatchId: null,
    };
    prisma.documentFiling.findFirst.mockResolvedValue(legacyFiling);
    prisma.documentFiling.findMany.mockResolvedValue([legacyFiling]);

    await processFilingReply(getReplyParams());

    expect(prisma.documentFiling.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "filing-1" } }),
    );
    expect(aiParseFilingReply).toHaveBeenCalledWith(
      expect.objectContaining({
        filingContexts: [expect.objectContaining({ id: "filing-1" })],
      }),
    );
  });

  it("falls back to the source message when the provider message ID changed", async () => {
    const filings = getFilingBatch();
    prisma.documentFiling.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(filings[0]);
    prisma.documentFiling.findMany.mockResolvedValue(filings);

    await processFilingReply(getReplyParams());

    expect(prisma.documentFiling.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          emailAccountId,
          messageId: "source-1",
        },
      }),
    );
    expect(aiParseFilingReply).toHaveBeenCalledWith(
      expect.objectContaining({
        filingContexts: expect.arrayContaining([
          expect.objectContaining({ id: "filing-1" }),
          expect.objectContaining({ id: "filing-2" }),
        ]),
      }),
    );
  });
});

function getReplyParams() {
  const sourceMessage = getMockParsedMessage({
    id: "source-1",
    threadId: "thread-1",
    headers: { "message-id": "<source-1@example.com>" },
  });
  const notificationMessage = getMockParsedMessage({
    id: "notification-1",
    threadId: "thread-1",
    headers: {
      "in-reply-to": "<source-1@example.com>",
      "message-id": "<notification-1@example.com>",
    },
  });
  const message = getMockParsedMessage({
    id: "reply-1",
    threadId: "thread-1",
    headers: {
      from: userEmail,
      "in-reply-to": "<notification-1@example.com>",
    },
  });
  const emailProvider = createMockEmailProvider({
    getThreadMessages: vi
      .fn()
      .mockResolvedValue([sourceMessage, notificationMessage, message]),
    isSentMessage: vi.fn().mockReturnValue(true),
  });

  return {
    emailAccountId,
    userEmail,
    message,
    emailProvider,
    emailAccount: getEmailAccount({ id: emailAccountId }),
    logger,
  };
}

function getFilingBatch(): Array<
  DocumentFiling & { driveConnection: DriveConnection }
> {
  return [
    getFiling({
      id: "filing-1",
      filename: "first.pdf",
      folderPath: "Receipts",
      notificationMessageId: "notification-1",
    }),
    getFiling({
      id: "filing-2",
      filename: "second.pdf",
      folderPath: "Invoices",
    }),
  ];
}

function getFiling({
  id,
  filename,
  folderPath,
  notificationMessageId = null,
}: {
  id: string;
  filename: string;
  folderPath: string;
  notificationMessageId?: string | null;
}): DocumentFiling & { driveConnection: DriveConnection } {
  const now = new Date();

  return {
    id,
    createdAt: now,
    updatedAt: now,
    messageId: "source-1",
    attachmentId: `${id}-attachment`,
    filename,
    folderId: "folder-1",
    folderPath,
    fileId: `${id}-file`,
    reasoning: null,
    confidence: 1,
    status: DocumentFilingStatus.FILED,
    wasAsked: false,
    wasCorrected: false,
    originalPath: null,
    correctedAt: null,
    feedbackPositive: null,
    feedbackAt: null,
    notificationMessageId,
    notificationSentAt: now,
    notificationBatchId: "batch-1",
    driveConnectionId: "drive-1",
    emailAccountId,
    driveConnection: {
      id: "drive-1",
      createdAt: now,
      updatedAt: now,
      provider: "google",
      email: userEmail,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isConnected: true,
      emailAccountId,
    },
  };
}
