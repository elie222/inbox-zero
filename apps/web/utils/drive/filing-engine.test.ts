import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getEmailAccount } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import { createScopedLogger } from "@/utils/logger";
import { getFilableAttachments, processAttachment } from "./filing-engine";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/drive/provider", () => ({
  createDriveProviderWithRefresh: vi.fn(),
}));
vi.mock("@/utils/drive/document-extraction", () => ({
  extractTextFromDocument: vi.fn(),
}));
vi.mock("@/utils/ai/document-filing/analyze-document", () => ({
  analyzeDocument: vi.fn(),
}));
vi.mock("@/utils/drive/filing-notifications", () => ({
  sendFiledNotification: vi.fn(),
  sendAskNotification: vi.fn(),
}));
vi.mock("@/utils/drive/filing-messaging-notifications", () => ({
  sendFilingMessagingNotifications: vi.fn(),
}));

import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";
import { extractTextFromDocument } from "@/utils/drive/document-extraction";
import {
  sendAskNotification,
  sendFiledNotification,
} from "@/utils/drive/filing-notifications";
import { sendFilingMessagingNotifications } from "@/utils/drive/filing-messaging-notifications";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";

const logger = createScopedLogger("filing-engine-test");

describe("processAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.driveConnection.findMany.mockResolvedValue([
      {
        id: "drive-connection-1",
        provider: "google",
        isConnected: true,
      } as any,
    ]);
    prisma.filingFolder.findMany.mockResolvedValue([
      {
        folderId: "folder-1",
        folderName: "Invoices",
        folderPath: "Invoices",
        driveConnectionId: "drive-connection-1",
        driveConnection: { provider: "google" },
      } as any,
    ]);
    prisma.documentFiling.create.mockImplementation(async ({ data }: any) => ({
      id: "filing-1",
      status: data.status,
      wasAsked: data.wasAsked,
      folderPath: data.folderPath,
    }));

    vi.mocked(extractTextFromDocument).mockResolvedValue({
      text: "Quarterly invoice",
    } as any);
    vi.mocked(sendFiledNotification).mockResolvedValue(undefined);
    vi.mocked(sendAskNotification).mockResolvedValue(undefined);
    vi.mocked(sendFilingMessagingNotifications).mockResolvedValue(undefined);
  });

  it("sends filed confirmation emails by default", async () => {
    const { attachment, emailAccount, emailProvider, message, uploadFile } =
      setupSuccessfulFiling({
        confidence: 0.95,
      });

    const result = await processAttachment({
      attachment,
      emailAccount,
      emailProvider,
      logger,
      message,
    });

    expect(result.success).toBe(true);
    expect(uploadFile).toHaveBeenCalled();
    expect(sendFiledNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        filingId: "filing-1",
        userEmail: "user@test.com",
      }),
    );
    expect(sendAskNotification).not.toHaveBeenCalled();
  });

  it("skips filed confirmation emails when disabled", async () => {
    const { attachment, emailAccount, emailProvider, message, uploadFile } =
      setupSuccessfulFiling({
        confidence: 0.95,
        filingConfirmationSendEmail: false,
      });

    const result = await processAttachment({
      attachment,
      emailAccount,
      emailProvider,
      logger,
      message,
    });

    expect(result.success).toBe(true);
    expect(uploadFile).toHaveBeenCalled();
    expect(sendFiledNotification).not.toHaveBeenCalled();
    expect(sendAskNotification).not.toHaveBeenCalled();
  });

  it("still sends ask emails when confirmation emails are disabled", async () => {
    const { attachment, emailAccount, emailProvider, message, uploadFile } =
      setupSuccessfulFiling({
        confidence: 0.4,
        filingConfirmationSendEmail: false,
      });

    const result = await processAttachment({
      attachment,
      emailAccount,
      emailProvider,
      logger,
      message,
    });

    expect(result.success).toBe(true);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(sendFiledNotification).not.toHaveBeenCalled();
    expect(sendAskNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        filingId: "filing-1",
        userEmail: "user@test.com",
      }),
    );
  });
});

describe("getFilableAttachments", () => {
  it("excludes calendar invite attachments", () => {
    const documentAttachment = createAttachment({
      attachmentId: "attachment-1",
      filename: "itinerary.pdf",
      mimeType: "application/pdf",
    });
    const calendarInvite = createAttachment({
      attachmentId: "attachment-2",
      filename: "invite.ics",
      mimeType: "text/calendar",
    });
    const calendarInviteWithGenericMimeType = createAttachment({
      attachmentId: "attachment-3",
      filename: "meeting.ics",
      mimeType: "application/octet-stream",
    });

    const message = getMockParsedMessage({
      attachments: [
        documentAttachment,
        calendarInvite,
        calendarInviteWithGenericMimeType,
      ],
    });

    expect(getFilableAttachments(message)).toEqual([documentAttachment]);
  });

  it("excludes calendar attachments even when the filename is generic", () => {
    const documentAttachment = createAttachment({
      attachmentId: "attachment-1",
      filename: "agenda.txt",
      mimeType: "text/plain",
    });
    const calendarInvite = createAttachment({
      attachmentId: "attachment-2",
      filename: "attachment.dat",
      mimeType: "text/calendar",
    });

    const message = getMockParsedMessage({
      attachments: [documentAttachment, calendarInvite],
    });

    expect(getFilableAttachments(message)).toEqual([documentAttachment]);
  });
});

function setupSuccessfulFiling({
  confidence,
  filingConfirmationSendEmail = true,
}: {
  confidence: number;
  filingConfirmationSendEmail?: boolean;
}) {
  const attachment = createAttachment({
    attachmentId: "attachment-1",
    filename: "invoice.pdf",
    mimeType: "application/pdf",
  });
  const message = getMockParsedMessage({
    attachments: [attachment],
    headers: {
      from: "sender@example.com",
      to: "user@test.com",
      subject: "Invoice",
      date: "2024-01-01T00:00:00Z",
      "message-id": "<message-1@example.com>",
    },
  });
  const emailProvider = createMockEmailProvider({
    getAttachment: vi.fn().mockResolvedValue({
      data: Buffer.from("pdf-bytes").toString("base64"),
      size: 8,
    }),
  });
  const uploadFile = vi.fn().mockResolvedValue({ id: "drive-file-1" });

  vi.mocked(createDriveProviderWithRefresh).mockResolvedValue({
    uploadFile,
  } as any);
  vi.mocked(analyzeDocument).mockResolvedValue({
    action: "use_existing",
    folderId: "folder-1",
    folderPath: null,
    confidence,
    reasoning: "Matches invoice folder",
  });

  return {
    attachment,
    emailAccount: {
      ...getEmailAccount(),
      filingEnabled: true,
      filingPrompt: "File invoices",
      filingConfirmationSendEmail,
    },
    emailProvider,
    message,
    uploadFile,
  };
}

function createAttachment({
  attachmentId,
  filename,
  mimeType,
}: {
  attachmentId: string;
  filename: string;
  mimeType: string;
}) {
  return {
    attachmentId,
    filename,
    headers: {
      "content-description": "",
      "content-id": "",
      "content-transfer-encoding": "base64",
      "content-type": mimeType,
    },
    mimeType,
    size: 128,
  };
}
