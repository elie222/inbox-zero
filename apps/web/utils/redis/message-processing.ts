import { createScopedLogger } from "@/utils/logger";
import {
  acquireOwnedLock,
  clearOwnedLock,
  markOwnedLockProcessed,
} from "@/utils/redis/owned-lock";

const OUTBOUND_PROCESSING_TTL_SECONDS = 60 * 30;
const OUTBOUND_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const OUTBOUND_PROCESSED_STATUS = "processed";

export async function withMessageProcessingLock(
  { userEmail, messageId }: { userEmail: string; messageId: string },
  fn: () => Promise<unknown>,
): Promise<{ skipped: boolean }> {
  const key = `processing-message:${userEmail}:${messageId}`;
  const lockToken = await acquireOwnedLock({
    key,
    processingTtlSeconds: 60 * 5,
  });
  if (!lockToken) return { skipped: true };

  try {
    await fn();
    // Keep the lock until its TTL expires to dedupe successful processing.
    return { skipped: false };
  } catch (error) {
    try {
      await clearOwnedLock({ key, lockToken });
    } catch (clearError) {
      createScopedLogger("message-processing").warn(
        "Failed to clear message processing lock",
        { error: clearError },
      );
    }
    throw error;
  }
}

type OutboundMessageKey = {
  emailAccountId: string;
  messageId: string;
  lockToken?: string;
};

export async function acquireOutboundMessageLock({
  emailAccountId,
  messageId,
}: OutboundMessageKey): Promise<string | null> {
  return acquireOwnedLock({
    key: getOutboundMessageKey({ emailAccountId, messageId }),
    processingTtlSeconds: OUTBOUND_PROCESSING_TTL_SECONDS,
  });
}

export async function markOutboundMessageProcessed({
  emailAccountId,
  messageId,
  lockToken,
}: OutboundMessageKey): Promise<boolean> {
  return markOwnedLockProcessed({
    key: getOutboundMessageKey({ emailAccountId, messageId }),
    lockToken,
    processedStatus: OUTBOUND_PROCESSED_STATUS,
    processedTtlSeconds: OUTBOUND_PROCESSED_TTL_SECONDS,
  });
}

export async function clearOutboundMessageLock({
  emailAccountId,
  messageId,
  lockToken,
}: OutboundMessageKey): Promise<boolean> {
  return clearOwnedLock({
    key: getOutboundMessageKey({ emailAccountId, messageId }),
    lockToken,
  });
}

function getOutboundMessageKey({
  emailAccountId,
  messageId,
}: OutboundMessageKey) {
  return `reply-tracker:outbound-message:${emailAccountId}:${messageId}`;
}
