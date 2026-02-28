import { redis } from "@/utils/redis";
import { DraftReplyConfidence } from "@/generated/prisma/enums";

export type ReplyWithConfidence = {
  reply: string;
  confidence: DraftReplyConfidence | null;
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
  confidence?: DraftReplyConfidence | null;
}) {
  return redis.set(
    getReplyKey({ emailAccountId, messageId }),
    JSON.stringify({
      reply,
      confidence: normalizeCachedConfidence(confidence),
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
  return { reply: cachedReply, confidence: null };
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

  if (isDraftReplyConfidence(confidence)) {
    return { reply, confidence };
  }

  if (confidence == null) {
    return { reply, confidence: null };
  }

  if (typeof confidence === "number") {
    return {
      reply,
      confidence: mapLegacyNumericConfidenceToEnum(confidence),
    };
  }

  return null;
}

function normalizeCachedConfidence(
  confidence: DraftReplyConfidence | null | undefined,
): DraftReplyConfidence {
  if (isDraftReplyConfidence(confidence)) return confidence;
  return DraftReplyConfidence.ALL_EMAILS;
}

function isDraftReplyConfidence(
  confidence: unknown,
): confidence is DraftReplyConfidence {
  return (
    typeof confidence === "string" &&
    Object.values(DraftReplyConfidence).includes(
      confidence as DraftReplyConfidence,
    )
  );
}

function mapLegacyNumericConfidenceToEnum(confidence: number) {
  if (!Number.isFinite(confidence)) return DraftReplyConfidence.ALL_EMAILS;
  if (confidence >= 90) return DraftReplyConfidence.HIGH_CONFIDENCE;
  if (confidence >= 70) return DraftReplyConfidence.STANDARD;
  return DraftReplyConfidence.ALL_EMAILS;
}
