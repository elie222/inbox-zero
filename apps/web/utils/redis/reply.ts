import { redis } from "@/utils/redis";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { normalizeDraftReplyConfidence } from "@/utils/ai/reply/draft-confidence";

export type ReplyWithConfidence = {
  reply: string;
  confidence: DraftReplyConfidence;
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
  confidence: DraftReplyConfidence;
}) {
  return redis.set(
    getReplyKey({ emailAccountId, messageId }),
    JSON.stringify({
      reply,
      confidence,
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
    const parsedReply = parseReplyWithConfidenceFromObject(parsed);
    if (parsedReply) return parsedReply;
  } catch {}

  // Legacy cache entries stored only the draft text.
  return {
    reply: cachedReply,
    confidence: DraftReplyConfidence.ALL_EMAILS,
  };
}

function parseReplyWithConfidenceFromObject(
  value: unknown,
): ReplyWithConfidence | null {
  if (!value || typeof value !== "object") return null;

  const { reply, confidence } = value as {
    reply?: unknown;
    confidence?: unknown;
  };

  if (typeof reply !== "string") return null;

  return {
    reply,
    confidence: normalizeDraftReplyConfidence(confidence),
  };
}
