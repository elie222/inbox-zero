import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

export async function getInboxStatsForChatContext({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const statsPromise = emailProvider.getInboxStats().catch((err) => {
      logger.warn("getInboxStats failed", { error: err });
      return null;
    });

    return await Promise.race([
      statsPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
  } catch (error) {
    logger.warn("Failed to fetch inbox stats for chat context", { error });
    return null;
  }
}
