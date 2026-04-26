import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { SafeError } from "@/utils/error";
import {
  buildDriveSourceItems,
  type DriveSourceItem,
} from "@/utils/drive/source-items";
import type { Logger } from "@/utils/logger";

export type GetDriveSourceItemsResponse = Awaited<ReturnType<typeof getData>>;
export type { DriveSourceItem } from "@/utils/drive/source-items";

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

  const items: DriveSourceItem[] = [];

  const connectionErrors: Array<{ provider: string; error: unknown }> = [];

  for (const connection of driveConnections) {
    try {
      const provider = await createDriveProviderWithRefresh(connection, logger);
      const [folders, files] = await Promise.all([
        provider.listFolders(undefined),
        provider.listFiles(undefined, { mimeTypes: ["application/pdf"] }),
      ]);

      items.push(
        ...buildDriveSourceItems({
          driveConnectionId: connection.id,
          provider: connection.provider,
          folders,
          files,
        }),
      );
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
