"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectDriveBody,
  updateFilingPromptBody,
  updateFilingEnabledBody,
  addFilingFolderBody,
  removeFilingFolderBody,
  submitPreviewFeedbackBody,
  moveFilingBody,
  createDriveFolderBody,
  fileAttachmentBody,
} from "@/utils/actions/drive.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createEmailProvider } from "@/utils/email/provider";
import {
  getExtractableAttachments,
  processAttachment,
} from "@/utils/drive/filing-engine";
import type { DriveProviderType } from "@/utils/drive/types";

export const disconnectDriveAction = actionClient
  .metadata({ name: "disconnectDrive" })
  .inputSchema(disconnectDriveBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.driveConnection.findUnique({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Drive connection not found");
      }

      await prisma.driveConnection.delete({
        where: { id: connectionId, emailAccountId },
      });
    },
  );

export const updateFilingPromptAction = actionClient
  .metadata({ name: "updateFilingPrompt" })
  .inputSchema(updateFilingPromptBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { filingPrompt } }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          filingPrompt: filingPrompt || null,
        },
      });
    },
  );

export const updateFilingEnabledAction = actionClient
  .metadata({ name: "updateFilingEnabled" })
  .inputSchema(updateFilingEnabledBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { filingEnabled } }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { filingEnabled },
      });
    },
  );

export const addFilingFolderAction = actionClient
  .metadata({ name: "addFilingFolder" })
  .inputSchema(addFilingFolderBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { folderId, folderName, folderPath, driveConnectionId },
    }) => {
      const connection = await prisma.driveConnection.findUnique({
        where: {
          id: driveConnectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Drive connection not found");
      }

      const folder = await prisma.filingFolder.upsert({
        where: {
          emailAccountId_folderId: {
            emailAccountId,
            folderId,
          },
        },
        create: {
          folderId,
          folderName,
          folderPath,
          driveConnectionId,
          emailAccountId,
        },
        update: {
          folderName,
          folderPath,
          driveConnectionId,
        },
      });

      return folder;
    },
  );

export const removeFilingFolderAction = actionClient
  .metadata({ name: "removeFilingFolder" })
  .inputSchema(removeFilingFolderBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { folderId } }) => {
    await prisma.filingFolder.deleteMany({
      where: { emailAccountId, folderId },
    });
  });

export const submitPreviewFeedbackAction = actionClient
  .metadata({ name: "submitPreviewFeedback" })
  .inputSchema(submitPreviewFeedbackBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { filingId, feedbackPositive },
    }) => {
      await prisma.documentFiling.update({
        where: { id: filingId, emailAccountId },
        data: {
          feedbackPositive,
          feedbackAt: new Date(),
        },
      });
    },
  );

export const moveFilingAction = actionClient
  .metadata({ name: "moveFiling" })
  .inputSchema(moveFilingBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { filingId, targetFolderId, targetFolderPath },
    }) => {
      const filing = await prisma.documentFiling.findUnique({
        where: { id: filingId, emailAccountId },
        select: { fileId: true, folderPath: true, driveConnection: true },
      });

      if (!filing) {
        throw new SafeError("Filing not found");
      }

      if (!filing.fileId) {
        throw new SafeError("Filing has no associated file");
      }

      const driveProvider = await createDriveProviderWithRefresh(
        filing.driveConnection,
        logger,
      );

      await driveProvider.moveFile(filing.fileId, targetFolderId);

      await prisma.documentFiling.update({
        where: { id: filingId },
        data: {
          folderId: targetFolderId,
          folderPath: targetFolderPath,
          originalPath: filing.folderPath,
          wasCorrected: true,
          feedbackPositive: false,
          feedbackAt: new Date(),
        },
      });
    },
  );

export const createDriveFolderAction = actionClient
  .metadata({ name: "createDriveFolder" })
  .inputSchema(createDriveFolderBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { folderName, driveConnectionId },
    }) => {
      const connection = await prisma.driveConnection.findUnique({
        where: {
          id: driveConnectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        logger.error("Drive connection not found", { driveConnectionId });
        throw new SafeError("Drive connection not found");
      }

      const driveProvider = await createDriveProviderWithRefresh(
        connection,
        logger,
      );

      const folder = await driveProvider.createFolder(folderName);

      return folder;
    },
  );

export type FileAttachmentResult = {
  filingId: string;
  filename: string;
  folderPath: string;
  fileId: string | null;
  filedAt: string;
  provider: DriveProviderType;
};

export const fileAttachmentAction = actionClient
  .metadata({ name: "fileAttachment" })
  .inputSchema(fileAttachmentBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { messageId, filename },
    }): Promise<FileAttachmentResult> => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          id: true,
          userId: true,
          email: true,
          about: true,
          multiRuleSelectionEnabled: true,
          timezone: true,
          calendarBookingLink: true,
          filingEnabled: true,
          filingPrompt: true,
          user: {
            select: {
              aiProvider: true,
              aiModel: true,
              aiApiKey: true,
            },
          },
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      if (!emailAccount.filingPrompt) {
        throw new SafeError("Filing prompt not configured");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      logger.info("Fetching message for filing", { messageId });
      const message = await emailProvider.getMessage(messageId);

      if (!message) {
        throw new SafeError("Message not found");
      }

      const extractableAttachments = getExtractableAttachments(message);
      const attachment = extractableAttachments.find(
        (a) => a.filename === filename,
      );

      if (!attachment) {
        throw new SafeError("Attachment not found or not extractable");
      }

      logger.info("Processing attachment", { filename: attachment.filename });
      const result = await processAttachment({
        emailAccount: {
          ...emailAccount,
          filingEnabled: true,
          filingPrompt: emailAccount.filingPrompt,
        },
        message,
        attachment,
        emailProvider,
        logger,
        sendNotification: false,
      });

      if (!result.success || !result.filing) {
        throw new SafeError(result.error || "Failed to file attachment");
      }

      return {
        filingId: result.filing.id,
        filename: result.filing.filename,
        folderPath: result.filing.folderPath,
        fileId: result.filing.fileId,
        filedAt: new Date().toISOString(),
        provider: result.filing.provider as DriveProviderType,
      };
    },
  );
