import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import { processAttachment } from "@/utils/drive/filing-engine";
import { sendFilingNotifications } from "@/utils/drive/filing-notifications";
import { processAttachmentsForFiling } from "./process-filing-attachments";

vi.mock("@/utils/drive/filing-engine", () => ({
  processAttachment: vi.fn(),
}));
vi.mock("@/utils/drive/filing-notifications", () => ({
  sendFilingNotifications: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();

describe("processAttachmentsForFiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one notification after filing multiple attachments", async () => {
    const attachments = [
      {
        attachmentId: "attachment-1",
        filename: "first.pdf",
        mimeType: "application/pdf",
        size: 123,
      },
      {
        attachmentId: "attachment-2",
        filename: "second.pdf",
        mimeType: "application/pdf",
        size: 456,
      },
    ];
    const message = getMockParsedMessage({ attachments });
    const emailProvider = createMockEmailProvider();
    const emailAccount = {
      ...getEmailAccount(),
      filingEnabled: true,
      filingPrompt: "File documents",
      filingConfirmationSendEmail: true,
    };
    vi.mocked(processAttachment)
      .mockResolvedValueOnce({
        success: true,
        filing: {
          id: "filing-1",
          filename: "first.pdf",
          folderPath: "Receipts",
          fileId: "file-1",
          wasAsked: false,
          confidence: 0.95,
          provider: "google",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        filing: {
          id: "filing-2",
          filename: "second.pdf",
          folderPath: "Invoices",
          fileId: "file-2",
          wasAsked: false,
          confidence: 0.95,
          provider: "google",
        },
      });

    await processAttachmentsForFiling({
      attachments,
      emailAccount,
      emailProvider,
      logger,
      message,
    });

    expect(processAttachment).toHaveBeenCalledTimes(2);
    expect(processAttachment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        attachment: attachments[0],
        sendNotification: false,
      }),
    );
    expect(processAttachment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        attachment: attachments[1],
        sendNotification: false,
      }),
    );
    expect(sendFilingNotifications).toHaveBeenCalledOnce();
    expect(sendFilingNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        filingIds: ["filing-1", "filing-2"],
        emailProvider,
        userEmail: emailAccount.email,
      }),
    );
  });
});
