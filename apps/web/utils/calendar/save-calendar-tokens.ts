import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export async function saveCalendarTokens({
  tokens,
  connectionId,
  expectedExpiresAt,
  logger,
}: {
  tokens: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date | null;
  };
  connectionId: string;
  expectedExpiresAt: number | null;
  logger: Logger;
}) {
  if (!tokens.accessToken) {
    logger.warn("No access token to save for calendar connection", {
      connectionId,
    });
    return;
  }

  try {
    const result = await prisma.calendarConnection.updateMany({
      where: {
        id: connectionId,
        expiresAt: getExpectedExpiresAtWhere(expectedExpiresAt),
      },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt ?? null,
      },
    });

    if (result.count === 0) {
      logger.info("Skipped stale calendar token update", { connectionId });
      return { status: "conflict" as const };
    }

    logger.info("Calendar tokens saved successfully", { connectionId });
    return { status: "saved" as const };
  } catch (error) {
    logger.error("Failed to save calendar tokens", { error, connectionId });
    throw error;
  }
}

function getExpectedExpiresAtWhere(expectedExpiresAt: number | null) {
  if (!expectedExpiresAt) return null;

  return {
    gte: new Date(expectedExpiresAt),
    lt: new Date(expectedExpiresAt + 1),
  };
}
