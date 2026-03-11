import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";

export type GetDriveSourceItemsResponse = Awaited<ReturnType<typeof getData>>;
export type DriveSourceItem = GetDriveSourceItemsResponse["items"][number];

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({
    emailAccountId,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getData({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const driveConnections = await prisma.driveConnection.findMany({
    where: {
      emailAccountId,
      isConnected: true,
    },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  const items: Array<{
    id: string;
    name: string;
    path: string;
    driveConnectionId: string;
    provider: string;
    type: "folder" | "file";
    parentId?: string;
    mimeType?: string;
  }> = [];

  const connectionErrors: Array<{ provider: string; error: unknown }> = [];

  for (const connection of driveConnections) {
    try {
      const provider = await createDriveProviderWithRefresh(connection, logger);
      const [folders, files] = await Promise.all([
        provider.listFolders(undefined),
        provider.listFiles(undefined, { mimeTypes: ["application/pdf"] }),
      ]);

      for (const folder of folders) {
        items.push({
          id: folder.id,
          name: folder.name,
          path: folder.path || folder.name,
          driveConnectionId: connection.id,
          provider: connection.provider,
          type: "folder",
          parentId: folder.parentId,
        });
      }

      for (const file of files) {
        items.push({
          id: file.id,
          name: file.name,
          path: file.name,
          driveConnectionId: connection.id,
          provider: connection.provider,
          type: "file",
          parentId: file.folderId,
          mimeType: file.mimeType,
        });
      }
    } catch (error) {
      logger.warn("Error fetching source items from drive", {
        connectionId: connection.id,
        provider: connection.provider,
        error,
      });
      connectionErrors.push({ provider: connection.provider, error });
    }
  }

  if (
    driveConnections.length > 0 &&
    connectionErrors.length === driveConnections.length
  ) {
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  return { items };
}
