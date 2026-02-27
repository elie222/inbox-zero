import { redis } from "@/utils/redis";

export type ReplyWithConfidence = {
  reply: string;
  confidence: number | null;
};

export async function getReply({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}): Promise<string | null> {
  const cachedReply = await getReplyWithConfidence({
    emailAccountId,
    messageId,
  });
  return cachedReply?.reply ?? null;
}

export async function getReplyWithConfidence({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}): Promise<ReplyWithConfidence | null> {
  const cachedReply = await redis.get<string>(
    getReplyKey({ emailAccountId, messageId }),
  );
  return parseCachedReply(cachedReply);
}

export async function saveReply({
  emailAccountId,
  messageId,
  reply,
  confidence,
}: {
  emailAccountId: string;
  messageId: string;
  reply: string;
  confidence?: number | null;
}) {
  return redis.set(
    getReplyKey({ emailAccountId, messageId }),
    JSON.stringify({
      reply,
      confidence: Number.isFinite(confidence) ? confidence : 0,
    }),
    {
      ex: 60 * 60 * 24, // 1 day
    },
  );
}

function getReplyKey({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}) {
  return `reply:${emailAccountId}:${messageId}`;
}

function parseCachedReply(
  cachedReply: string | null,
): ReplyWithConfidence | null {
  if (!cachedReply) return null;

  try {
    const parsed = JSON.parse(cachedReply);
    if (isReplyWithConfidence(parsed)) return parsed;
  } catch {}

  // Legacy cache entries stored only the draft text.
  return { reply: cachedReply, confidence: null };
}

function isReplyWithConfidence(value: unknown): value is ReplyWithConfidence {
  if (!value || typeof value !== "object") return false;

  const { reply, confidence } = value as {
    reply?: unknown;
    confidence?: unknown;
  };

  return (
    typeof reply === "string" &&
    (confidence === null || typeof confidence === "number")
  );
}
