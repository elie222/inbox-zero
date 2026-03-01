import { createHash } from "node:crypto";
import { createScopedLogger } from "@/utils/logger";
import { redis } from "@/utils/redis";

const MESSAGING_LINK_NONCE_TTL_SECONDS = 10 * 60;
const logger = createScopedLogger("messaging-link-code");

function getMessagingLinkNonceKey(nonce: string) {
  const nonceHash = createHash("sha256")
    .update(nonce)
    .digest("hex")
    .slice(0, 20);
  return `messaging-link:${nonceHash}`;
}

export async function consumeMessagingLinkNonce(
  nonce: string,
): Promise<boolean> {
  try {
    const result = await redis.set(getMessagingLinkNonceKey(nonce), "used", {
      ex: MESSAGING_LINK_NONCE_TTL_SECONDS,
      nx: true,
    });

    return result === "OK";
  } catch (error) {
    logger.warn("Failed to consume messaging link nonce", { error });
    return false;
  }
}
