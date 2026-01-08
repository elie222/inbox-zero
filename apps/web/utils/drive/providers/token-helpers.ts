import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

export async function saveDriveTokens({
  tokens,
  connectionId,
  logger,
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number; // seconds
  };
  connectionId: string;
  logger: Logger;
}) {
  if (!tokens.access_token) {
    logger.warn("No access token to save for drive connection", {
      connectionId,
    });
    return;
  }

  try {
    await prisma.driveConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        expiresAt: tokens.expires_at
          ? new Date(tokens.expires_at * 1000)
          : null,
        isConnected: true,
      },
    });

    logger.info("Drive tokens saved successfully", { connectionId });
  } catch (error) {
    logger.error("Failed to save drive tokens", { error, connectionId });
    throw error;
  }
}

export async function markDriveConnectionAsDisconnected(connectionId: string) {
  await prisma.driveConnection.update({
    where: { id: connectionId },
    data: { isConnected: false },
  });
}
