import { createHash } from "node:crypto";
import { redis } from "@/utils/redis";

const MESSAGING_LINK_NONCE_TTL_SECONDS = 10 * 60;

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
  const result = await redis.set(getMessagingLinkNonceKey(nonce), "used", {
    ex: MESSAGING_LINK_NONCE_TTL_SECONDS,
    nx: true,
  });

  return result === "OK";
}
