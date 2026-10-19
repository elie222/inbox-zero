import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";
import type { Logger } from "@/utils/logger";
import {
  acquireOwnedLock,
  clearOwnedLock,
  markOwnedLockProcessed,
} from "@/utils/redis/owned-lock";

const MESSAGE_PROCESSING_TTL_SECONDS = 60 * 5;
const OUTBOUND_PROCESSING_TTL_SECONDS = 60 * 30;
const OUTBOUND_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const OUTBOUND_PROCESSED_STATUS = "processed";

function getProcessingKey({
  userEmail,
  messageId,
}: {
  userEmail: string;
  messageId: string;
}) {
  return `processing-message:${userEmail}:${messageId}`;
}

/** Returns a lock token, or null when another run is already processing the message. */
export async function markMessageAsProcessing({
  userEmail,
  messageId,
}: {
  userEmail: string;
  messageId: string;
}): Promise<string | null> {
  return acquireOwnedLock({
    key: getProcessingKey({ userEmail, messageId }),
    processingTtlSeconds: MESSAGE_PROCESSING_TTL_SECONDS,
  });
}

export async function releaseMessageProcessingLock({
  userEmail,
  messageId,
  lockToken,
}: {
  userEmail: string;
  messageId: string;
  lockToken: string;
}): Promise<boolean> {
  return clearOwnedLock({
    key: getProcessingKey({ userEmail, messageId }),
    lockToken,
  });
}

/**
 * A rate-limited message is replayed by the provider's rate-limit catch-up,
 * which would skip it while this run still holds the processing lock. Other
 * failures keep the lock so the message isn't processed twice.
 */
export async function releaseMessageProcessingLockOnRateLimit({
  error,
  provider,
  userEmail,
  messageId,
  lockToken,
  logger,
}: {
  error: unknown;
  provider: "google" | "microsoft";
  userEmail: string;
  messageId: string;
  lockToken: string;
  logger: Logger;
}) {
  if (!isEmailProviderRateLimitError({ error, provider })) return;

  // Never throw from here: callers rethrow the rate-limit error, which is what
  // keeps the history cursor from advancing past this message.
  try {
    await releaseMessageProcessingLock({ userEmail, messageId, lockToken });
  } catch (releaseError) {
    logger.warn("Failed to release message processing lock", {
      error: releaseError,
    });
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
