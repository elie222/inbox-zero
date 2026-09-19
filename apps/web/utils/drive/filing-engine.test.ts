import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import prisma from "@/utils/__mocks__/prisma";
import { getEmailAccount } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import { Prisma } from "@/generated/prisma/client";
import { createTestLogger } from "@/__tests__/helpers";
import { getFilableAttachments, processAttachment } from "./filing-engine";

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
vi.mock("@/utils/drive/folder-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/drive/folder-utils")>()),
  createAndSaveFilingFolder: vi.fn(),
}));

import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { extractTextFromDocument } from "@/utils/drive/document-extraction";
import {
  sendAskNotification,
  sendFiledNotification,
} from "@/utils/drive/filing-notifications";
import { sendFilingMessagingNotifications } from "@/utils/drive/filing-messaging-notifications";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";

const logger = createTestLogger();

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
    prisma.documentFiling.update.mockImplementation(
      async ({ data, where }: any) => ({
        id: where.id,
        status: data.status,
        wasAsked: data.wasAsked,
        folderPath: data.folderPath,
      }),
    );
    prisma.documentFiling.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.documentFiling.findFirst.mockResolvedValue(null);

    vi.mocked(extractTextFromDocument).mockResolvedValue({
      text: "Quarterly invoice",
    } as any);
    vi.mocked(sendFiledNotification).mockResolvedValue(undefined);
    vi.mocked(sendAskNotification).mockResolvedValue(undefined);
    vi.mocked(sendFilingMessagingNotifications).mockResolvedValue(undefined);
    vi.mocked(createAndSaveFilingFolder).mockResolvedValue({
      id: "new-folder-1",
      name: "New Folder",
    });
  });

  describe("creating folders", () => {
    beforeEach(() => {
      prisma.filingFolder.findMany.mockResolvedValue([
        mockDeep<
          Prisma.FilingFolderGetPayload<{ include: { driveConnection: true } }>
        >({
          folderId: "folder-1",
          folderName: "Invoices",
          folderPath: "Finance/Invoices",
          driveConnectionId: "drive-connection-1",
          driveConnection: { provider: "google" },
        }),
        mockDeep<
          Prisma.FilingFolderGetPayload<{ include: { driveConnection: true } }>
        >({
          folderId: "folder-2",
          folderName: "Acme",
          folderPath: "Finance/Invoices/Acme",
          driveConnectionId: "drive-connection-1",
          driveConnection: { provider: "google" },
        }),
      ]);
    });

    it("creates a subfolder inside the parent folder the AI chose", async () => {
      const { attachment, emailAccount, emailProvider, message, uploadFile } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: "folder-1",
        folderPath: "Globex/2026",
        confidence: 0.95,
        reasoning: "Invoices are grouped by vendor and year",
      });

      const result = await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(result.success).toBe(true);
      expect(createAndSaveFilingFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          folderPath: "Globex/2026",
          parent: { id: "folder-1", path: "Finance/Invoices" },
          driveConnectionId: "drive-connection-1",
        }),
      );
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: "new-folder-1" }),
      );
      expect(prisma.documentFiling.update).toHaveBeenCalledWith({
        where: { id: "filing-1" },
        data: expect.objectContaining({
          folderId: "new-folder-1",
          folderPath: "Finance/Invoices/Globex/2026",
        }),
      });
    });

    it("nests a full path under the known folder that prefixes it when no parent id is given", async () => {
      const { attachment, emailAccount, emailProvider, message } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: null,
        folderPath: "Finance/Invoices/Acme/2026",
        confidence: 0.95,
        reasoning: "Acme invoices by year",
      });

      await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(createAndSaveFilingFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          folderPath: "2026",
          parent: { id: "folder-2", path: "Finance/Invoices/Acme" },
        }),
      );
      expect(prisma.documentFiling.update).toHaveBeenCalledWith({
        where: { id: "filing-1" },
        data: expect.objectContaining({
          folderPath: "Finance/Invoices/Acme/2026",
        }),
      });
    });

    it.each([
      "Globex/2026",
      "Acme",
    ])("preserves the selected parent when another folder shares its path: %s", async (folderPath) => {
      const savedFolders = await prisma.filingFolder.findMany();
      prisma.filingFolder.findMany.mockResolvedValue([
        ...savedFolders,
        ...savedFolders
          .filter((folder) => folder.folderId === "folder-1")
          .map((folder) => ({ ...folder, folderId: "selected-parent" })),
      ]);
      const { attachment, emailAccount, emailProvider, message, uploadFile } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: "selected-parent",
        folderPath,
        confidence: 0.95,
        reasoning: "File inside the selected parent",
      });

      await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(createAndSaveFilingFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          folderPath,
          parent: { id: "selected-parent", path: "Finance/Invoices" },
        }),
      );
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: "new-folder-1" }),
      );
    });

    it.each([
      true,
      false,
    ])("uses the selected parent's connection only when connected: %s", async (connected) => {
      const savedFolders = await prisma.filingFolder.findMany();
      prisma.filingFolder.findMany.mockResolvedValue([
        ...savedFolders,
        ...savedFolders
          .filter((folder) => folder.folderId === "folder-1")
          .map((folder) => ({
            ...folder,
            folderId: "other-drive-parent",
            driveConnectionId: "drive-connection-2",
          })),
      ]);
      if (connected) {
        const connections = await prisma.driveConnection.findMany();
        prisma.driveConnection.findMany.mockResolvedValue([
          ...connections,
          ...connections.map((connection) => ({
            ...connection,
            id: "drive-connection-2",
          })),
        ]);
      }
      const { attachment, emailAccount, emailProvider, message, uploadFile } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: "other-drive-parent",
        folderPath: "2026",
        confidence: 0.95,
        reasoning: "File inside the selected parent",
      });

      const result = await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(result.success).toBe(connected);
      if (connected) {
        expect(createDriveProviderWithRefresh).toHaveBeenCalledWith(
          expect.objectContaining({ id: "drive-connection-2" }),
          expect.anything(),
        );
        expect(createAndSaveFilingFolder).toHaveBeenCalledWith(
          expect.objectContaining({
            driveConnectionId: "drive-connection-2",
            parent: { id: "other-drive-parent", path: "Finance/Invoices" },
          }),
        );
      } else {
        expect(createAndSaveFilingFolder).not.toHaveBeenCalled();
        expect(uploadFile).not.toHaveBeenCalled();
      }
    });

    it("reuses an existing folder instead of creating a duplicate when the requested full path already exists", async () => {
      const { attachment, emailAccount, emailProvider, message, uploadFile } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: null,
        folderPath: "Finance/Invoices/acme",
        confidence: 0.95,
        reasoning: "Acme invoice",
      });

      await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(createAndSaveFilingFolder).not.toHaveBeenCalled();
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: "folder-2" }),
      );
      expect(prisma.documentFiling.update).toHaveBeenCalledWith({
        where: { id: "filing-1" },
        data: expect.objectContaining({
          folderId: "folder-2",
          folderPath: "Finance/Invoices/Acme",
        }),
      });
    });

    it("does not file when an explicit parent is missing", async () => {
      const { attachment, emailAccount, emailProvider, message, uploadFile } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: "deleted-folder",
        folderPath: "Finance/Invoices/Acme",
        confidence: 0.95,
        reasoning: "File beneath the selected parent",
      });

      const result = await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(result).toEqual({
        success: false,
        error: "The selected parent folder could not be found",
      });
      expect(createAndSaveFilingFolder).not.toHaveBeenCalled();
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it("falls back to the drive root when no parent is selected and the path is unknown", async () => {
      const { attachment, emailAccount, emailProvider, message } =
        setupSuccessfulFiling({ confidence: 0.95 });
      vi.mocked(analyzeDocument).mockResolvedValue({
        action: "create_new",
        folderId: null,
        parentFolderId: null,
        folderPath: "Contracts",
        confidence: 0.95,
        reasoning: "No contracts folder exists",
      });

      await processAttachment({
        attachment,
        emailAccount,
        emailProvider,
        logger,
        message,
      });

      expect(createAndSaveFilingFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          folderPath: "Contracts",
          parent: null,
          driveConnectionId: "drive-connection-1",
        }),
      );
      expect(prisma.documentFiling.update).toHaveBeenCalledWith({
        where: { id: "filing-1" },
        data: expect.objectContaining({ folderPath: "Contracts" }),
      });
    });
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

  it.each([
    { kind: "filed", confidence: 0.95, mock: () => sendFiledNotification },
    { kind: "ask", confidence: 0.4, mock: () => sendAskNotification },
  ])("passes the platform message id in sourceMessage for $kind notifications so Outlook can thread the reply", async ({
    confidence,
    mock,
  }) => {
    const { attachment, emailAccount, emailProvider, message } =
      setupSuccessfulFiling({ confidence });

    await processAttachment({
      attachment,
      emailAccount,
      emailProvider,
      logger,
      message,
    });

    expect(mock()).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessage: expect.objectContaining({
          messageId: message.id,
        }),
      }),
    );
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

  it("does not upload an attachment that already has a filing record", async () => {
    prisma.documentFiling.findFirst.mockResolvedValue({
      id: "filing-existing",
      filename: "invoice.pdf",
      folderPath: "Invoices",
      fileId: "drive-file-existing",
      status: "FILED",
      wasAsked: false,
      confidence: 0.95,
      reasoning: "Already filed",
      driveConnection: { provider: "google" },
    } as any);
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

    expect(result).toEqual({
      success: true,
      filing: {
        id: "filing-existing",
        filename: "invoice.pdf",
        folderPath: "Invoices",
        fileId: "drive-file-existing",
        wasAsked: false,
        confidence: 0.95,
        provider: "google",
      },
      filingId: "filing-existing",
    });
    expect(emailProvider.getAttachment).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("does not download, analyze, or upload when a concurrent process already claimed the attachment", async () => {
    const existingFiling = {
      id: "filing-existing",
      filename: "invoice.pdf",
      folderPath: "Invoices",
      fileId: "drive-file-existing",
      status: "FILED",
      wasAsked: false,
      confidence: 0.95,
      reasoning: "Already filed",
      driveConnection: { provider: "google" },
    };
    prisma.documentFiling.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingFiling as any);
    prisma.documentFiling.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: {
          target: ["emailAccountId", "messageId", "attachmentId"],
        },
      }),
    );
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

    expect(result).toEqual({
      success: true,
      filing: {
        id: "filing-existing",
        filename: "invoice.pdf",
        folderPath: "Invoices",
        fileId: "drive-file-existing",
        wasAsked: false,
        confidence: 0.95,
        provider: "google",
      },
      filingId: "filing-existing",
    });
    expect(emailProvider.getAttachment).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("continues filing when a duplicate claim conflict finds a stale claim that can be reclaimed", async () => {
    prisma.documentFiling.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "filing-stale-processing",
        filename: "invoice.pdf",
        folderPath: "",
        fileId: null,
        status: "PROCESSING",
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        wasAsked: false,
        confidence: null,
        reasoning: null,
        driveConnection: { provider: "google" },
      } as any);
    prisma.documentFiling.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: {
          target: ["emailAccountId", "messageId", "attachmentId"],
        },
      }),
    );
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
    expect(prisma.documentFiling.update).toHaveBeenCalledWith({
      where: { id: "filing-stale-processing" },
      data: expect.objectContaining({
        status: "FILED",
        fileId: "drive-file-1",
      }),
    });
  });

  it("does not download, analyze, or upload while a filing claim is fresh", async () => {
    prisma.documentFiling.findFirst.mockResolvedValue({
      id: "filing-processing",
      filename: "invoice.pdf",
      folderPath: "",
      fileId: null,
      status: "PROCESSING",
      updatedAt: new Date(),
      wasAsked: false,
      confidence: null,
      reasoning: null,
      driveConnection: { provider: "google" },
    } as any);
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

    expect(result).toEqual({
      success: false,
      error: "Attachment is already being filed",
      filingId: "filing-processing",
    });
    expect(emailProvider.getAttachment).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("reclaims a stale filing claim before downloading it", async () => {
    prisma.documentFiling.findFirst.mockResolvedValue({
      id: "filing-stale-processing",
      filename: "invoice.pdf",
      folderPath: "",
      fileId: null,
      status: "PROCESSING",
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      wasAsked: false,
      confidence: null,
      reasoning: null,
      driveConnection: { provider: "google" },
    } as any);
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
    expect(prisma.documentFiling.create).not.toHaveBeenCalled();
    expect(prisma.documentFiling.updateMany).toHaveBeenCalledWith({
      where: {
        id: "filing-stale-processing",
        status: "PROCESSING",
        updatedAt: { lte: expect.any(Date) },
      },
      data: expect.objectContaining({
        reasoning: null,
      }),
    });
    expect(prisma.documentFiling.updateMany).toHaveBeenCalledBefore(
      emailProvider.getAttachment as any,
    );
  });

  it("claims an attachment before downloading it", async () => {
    const { attachment, emailAccount, emailProvider, message } =
      setupSuccessfulFiling({
        confidence: 0.95,
      });

    await processAttachment({
      attachment,
      emailAccount,
      emailProvider,
      logger,
      message,
    });

    expect(prisma.documentFiling.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailAccountId: emailAccount.id,
        messageId: message.id,
        attachmentId: attachment.attachmentId,
        status: "PROCESSING",
      }),
    });
    expect(prisma.documentFiling.create).toHaveBeenCalledBefore(
      emailProvider.getAttachment as any,
    );
  });

  it("retries an error filing record without creating a duplicate row", async () => {
    prisma.documentFiling.findFirst.mockResolvedValue({
      id: "filing-error",
      filename: "invoice.pdf",
      folderPath: "Invoices",
      fileId: null,
      status: "ERROR",
      wasAsked: false,
      confidence: null,
      reasoning: "Previous attempt failed",
      driveConnection: { provider: "google" },
    } as any);
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
    expect(analyzeDocument).toHaveBeenCalled();
    expect(prisma.documentFiling.create).not.toHaveBeenCalled();
    expect(prisma.documentFiling.updateMany).toHaveBeenCalledWith({
      where: {
        id: "filing-error",
        status: "ERROR",
      },
      data: expect.objectContaining({
        reasoning: null,
        status: "PROCESSING",
      }),
    });
    expect(prisma.documentFiling.updateMany).toHaveBeenCalledBefore(
      emailProvider.getAttachment as any,
    );
    expect(prisma.documentFiling.update).toHaveBeenCalledWith({
      where: { id: "filing-error" },
      data: expect.objectContaining({
        status: "FILED",
        fileId: "drive-file-1",
      }),
    });
  });

  it("does not duplicate expensive work when another retry already reclaimed an error filing", async () => {
    prisma.documentFiling.findFirst
      .mockResolvedValueOnce({
        id: "filing-error",
        filename: "invoice.pdf",
        folderPath: "Invoices",
        fileId: null,
        status: "ERROR",
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        wasAsked: false,
        confidence: null,
        reasoning: "Previous attempt failed",
        driveConnection: { provider: "google" },
      } as any)
      .mockResolvedValueOnce({
        id: "filing-error",
        filename: "invoice.pdf",
        folderPath: "",
        fileId: null,
        status: "PROCESSING",
        updatedAt: new Date(),
        wasAsked: false,
        confidence: null,
        reasoning: null,
        driveConnection: { provider: "google" },
      } as any);
    prisma.documentFiling.updateMany.mockResolvedValueOnce({
      count: 0,
    } as any);
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

    expect(result).toEqual({
      success: false,
      error: "Attachment is already being filed",
      filingId: "filing-error",
    });
    expect(emailProvider.getAttachment).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(analyzeDocument).not.toHaveBeenCalled();
  });
});

describe("getFilableAttachments", () => {
  it("excludes inline images embedded in the email body", () => {
    const documentAttachment = createAttachment({
      attachmentId: "attachment-1",
      filename: "receipt.pdf",
      mimeType: "application/pdf",
    });
    const inlineImage = {
      ...createAttachment({
        attachmentId: "attachment-2",
        filename: "signature-logo.png",
        mimeType: "image/png",
      }),
      headers: {
        "content-description": "",
        "content-disposition": 'inline; filename="signature-logo.png"',
        "content-id": "<signature-logo>",
        "content-transfer-encoding": "base64",
        "content-type": 'image/png; name="signature-logo.png"',
      },
    };

    const message = getMockParsedMessage({
      attachments: [documentAttachment, inlineImage],
    });

    expect(getFilableAttachments(message)).toEqual([documentAttachment]);
  });

  it("keeps attachments when inline appears only in a disposition parameter", () => {
    const documentAttachment = {
      ...createAttachment({
        attachmentId: "attachment-1",
        filename: "inline-report.pdf",
        mimeType: "application/pdf",
      }),
      headers: {
        "content-description": "",
        "content-disposition": 'attachment; filename="inline-report.pdf"',
        "content-id": "",
        "content-transfer-encoding": "base64",
        "content-type": 'application/pdf; name="inline-report.pdf"',
      },
    };

    const message = getMockParsedMessage({
      attachments: [documentAttachment],
    });

    expect(getFilableAttachments(message)).toEqual([documentAttachment]);
  });

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
    parentFolderId: null,
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
