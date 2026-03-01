import { formatUtcDate } from "@/utils/date";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const MAX_CHAT_MEMORIES = 20;

export async function getRecentChatMemories({
  emailAccountId,
  logger,
  logContext,
}: {
  emailAccountId: string;
  logger: Logger;
  logContext: "messaging chat" | "Slack chat";
}): Promise<{ content: string; date: string }[]> {
  try {
    const memories = await prisma.chatMemory.findMany({
      where: { emailAccountId },
      orderBy: { createdAt: "desc" },
      take: MAX_CHAT_MEMORIES,
      select: { content: true, createdAt: true },
    });

    return memories.map((memory) => ({
      content: memory.content,
      date: formatUtcDate(memory.createdAt),
    }));
  } catch (error) {
    logger.warn(`Failed to load memories for ${logContext}`, { error });
    return [];
  }
}
