import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";

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
  }> = [];

  const connectionErrors: Array<{ provider: string; error: unknown }> = [];

  const driveConnections = emailAccount?.driveConnections ?? [];

  for (const connection of driveConnections) {
    try {
      const provider = await createDriveProviderWithRefresh(connection, logger);
      const folders = await provider.listFolders(undefined);

      for (const folder of folders) {
        availableFolders.push({
          id: folder.id,
          name: folder.name,
          path: folder.name,
          driveConnectionId: connection.id,
          provider: connection.provider,
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

  return {
    savedFolders: emailAccount?.filingFolders ?? [],
    availableFolders,
  };
}
