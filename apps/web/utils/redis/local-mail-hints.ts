import "server-only";
import { redis } from "@/utils/redis";
import type { Logger } from "@/utils/logger";

export function localMailHintChannel(emailAccountId: string) {
  return `local-mail:${emailAccountId}`;
}

export async function refreshLocalMailInterest(emailAccountId: string) {
  await redis.set(`local-mail-interest:${emailAccountId}`, "1", { ex: 75 });
}

export async function publishLocalMailHint(
  emailAccountId: string,
  logger: Logger,
) {
  try {
    if (!(await redis.exists(`local-mail-interest:${emailAccountId}`))) return;
    const acquired = await redis.set(
      `local-mail-hint-cooldown:${emailAccountId}`,
      "1",
      {
        nx: true,
        ex: 2,
      },
    );
    if (!acquired) return;
    await redis.publish(localMailHintChannel(emailAccountId), "{}");
  } catch (error) {
    logger.warn("Failed to publish local mail hint", { error });
  }
}
