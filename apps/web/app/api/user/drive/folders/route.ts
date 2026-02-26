import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import type { DriveProvider } from "@/utils/drive/types";

export type GetDriveFoldersResponse = Awaited<ReturnType<typeof getData>>;
export type FolderItem = GetDriveFoldersResponse["availableFolders"][number] & {
  parentId?: string;
};
export type SavedFolder = GetDriveFoldersResponse["savedFolders"][number];

export const GET = withEmailAccount(async (request) => {
  const logger = request.logger;
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId, logger });
  return NextResponse.json(result);
});

async function getData({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      driveConnections: {
        where: { isConnected: true },
      },
      filingFolders: {
        select: {
          id: true,
          folderId: true,
          folderName: true,
          folderPath: true,
          driveConnectionId: true,
          driveConnection: {
            select: { provider: true },
          },
        },
      },
    },
  });

  // Fetch top-level folders from each drive (depth 1 only)
  const availableFolders: Array<{
    id: string;
    name: string;
    path: string;
    driveConnectionId: string;
    provider: string;
    parentId?: string;
  }> = [];

  const connectionErrors: Array<{ provider: string; error: unknown }> = [];
  const providersByConnectionId = new Map<string, DriveProvider>();

  const driveConnections = emailAccount?.driveConnections ?? [];

  for (const connection of driveConnections) {
    try {
      const provider = await createDriveProviderWithRefresh(connection, logger);
      providersByConnectionId.set(connection.id, provider);
      const folders = await provider.listFolders(undefined);

      for (const folder of folders) {
        availableFolders.push({
          id: folder.id,
          name: folder.name,
          path: folder.name,
          driveConnectionId: connection.id,
          provider: connection.provider,
          parentId: folder.parentId,
        });
      }
    } catch (error) {
      logger.warn("Error fetching folders from drive", {
        connectionId: connection.id,
        provider: connection.provider,
        error,
      });
      connectionErrors.push({ provider: connection.provider, error });
    }
  }

  // If we have connections but all failed, throw an error
  if (
    driveConnections.length > 0 &&
    connectionErrors.length === driveConnections.length
  ) {
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  // Filter out saved folders that no longer exist in the connected drive.
  // Uses getFolder() per folder so it works for both root and nested folders
  // across all providers (Google Drive, OneDrive).
  // Folders whose connection failed to load are kept to avoid false-positive cleanup.
  const allSavedFolders = emailAccount?.filingFolders ?? [];
  const savedFolders: typeof allSavedFolders = [];
  const staleFolderDbIds: string[] = [];

  const validationResults = await Promise.allSettled(
    allSavedFolders.map(async (sf) => {
      const provider = providersByConnectionId.get(sf.driveConnectionId);
      if (!provider) return true;
      const folder = await provider.getFolder(sf.folderId);
      return folder !== null;
    }),
  );

  for (let i = 0; i < validationResults.length; i++) {
    const result = validationResults[i];
    if (result.status === "fulfilled" && !result.value) {
      staleFolderDbIds.push(allSavedFolders[i].id);
    } else {
      // Keep folder if it exists, or if validation failed (network error etc.)
      savedFolders.push(allSavedFolders[i]);
    }
  }

  return {
    savedFolders,
    availableFolders,
    staleFolderDbIds,
  };
}
