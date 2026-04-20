import {
  acquireOwnedLock,
  clearOwnedLock,
  markOwnedLockProcessed,
} from "@/utils/redis/owned-lock";

const PROCESSING_TTL_SECONDS = 60 * 30;
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const PROCESSED_STATUS = "processed";

type OutboundThreadStatusKey = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  lockToken?: string;
};

export async function acquireOutboundThreadStatusLock({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey): Promise<string | null> {
  return acquireOwnedLock({
    key: getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
    processingTtlSeconds: PROCESSING_TTL_SECONDS,
  });
}

export async function markOutboundThreadStatusProcessed({
  emailAccountId,
  threadId,
  messageId,
  lockToken,
}: OutboundThreadStatusKey): Promise<boolean> {
  return markOwnedLockProcessed({
    key: getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
    lockToken,
    processedStatus: PROCESSED_STATUS,
    processedTtlSeconds: PROCESSED_TTL_SECONDS,
  });
}

export async function clearOutboundThreadStatusLock({
  emailAccountId,
  threadId,
  messageId,
  lockToken,
}: OutboundThreadStatusKey): Promise<boolean> {
  return clearOwnedLock({
    key: getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
    lockToken,
  });
}

function getOutboundThreadStatusKey({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey) {
  return `reply-tracker:outbound-thread-status:${emailAccountId}:${threadId}:${messageId}`;
}
