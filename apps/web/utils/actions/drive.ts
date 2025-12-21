"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectDriveBody,
  updateFilingPreferencesBody,
  addFilingFolderBody,
  removeFilingFolderBody,
} from "@/utils/actions/drive.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const disconnectDriveAction = actionClient
  .metadata({ name: "disconnectDrive" })
  .inputSchema(disconnectDriveBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.driveConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Drive connection not found");
      }

      await prisma.driveConnection.delete({
        where: { id: connectionId },
      });
    },
  );

export const updateFilingPreferencesAction = actionClient
  .metadata({ name: "updateFilingPreferences" })
  .inputSchema(updateFilingPreferencesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { filingEnabled, filingPrompt },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          filingEnabled,
          filingPrompt: filingPrompt || null,
        },
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
      // Verify the drive connection belongs to this email account
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
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const folder = await prisma.filingFolder.findUnique({
      where: { id },
    });

    if (!folder || folder.emailAccountId !== emailAccountId) {
      throw new SafeError("Filing folder not found");
    }

    await prisma.filingFolder.delete({
      where: { id },
    });
  });
