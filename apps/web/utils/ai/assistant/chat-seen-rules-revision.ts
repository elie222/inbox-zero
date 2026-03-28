import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export function mergeSeenRulesRevision(
  currentRulesRevision: number | null,
  nextRulesRevision: number,
) {
  return currentRulesRevision == null
    ? nextRulesRevision
    : Math.max(currentRulesRevision, nextRulesRevision);
}

export async function saveLastSeenRulesRevision({
  chatId,
  rulesRevision,
  logger,
}: {
  chatId: string;
  rulesRevision: number;
  logger: Logger;
}) {
  try {
    await prisma.chat.updateMany({
      where: {
        id: chatId,
        OR: [
          { lastSeenRulesRevision: null },
          { lastSeenRulesRevision: { lt: rulesRevision } },
        ],
      },
      data: {
        lastSeenRulesRevision: rulesRevision,
      },
    });
  } catch (error) {
    logger.error("Failed to save rules revision", { error, chatId });
    throw error;
  }
}
