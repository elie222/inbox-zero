import { redis } from "@/utils/redis";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import type { SelectedAttachment } from "@/utils/attachments/source-schema";

export type ReplyWithConfidence = {
  attachments?: SelectedAttachment[];
  reply: string;
  confidence: DraftReplyConfidence;
};

export async function getReply({
  emailAccountId,
  messageId,
  ruleId,
}: {
  emailAccountId: string;
  messageId: string;
  ruleId?: string;
}): Promise<string | null> {
  const cachedReply = await getReplyWithConfidence({
    emailAccountId,
    messageId,
    ruleId,
  });
  return cachedReply?.reply ?? null;
}

export async function getReplyWithConfidence({
  emailAccountId,
  messageId,
  ruleId,
}: {
  emailAccountId: string;
  messageId: string;
  ruleId?: string;
}): Promise<ReplyWithConfidence | null> {
  const cachedReply = await redis.get<string>(
    getReplyKey({ emailAccountId, messageId, ruleId }),
  );
  return parseCachedReply(cachedReply);
}

export async function saveReply({
  emailAccountId,
  messageId,
  reply,
  confidence,
  attachments,
  ruleId,
}: {
  emailAccountId: string;
  messageId: string;
  reply: string;
  confidence: DraftReplyConfidence;
  attachments?: SelectedAttachment[];
  ruleId?: string;
}) {
  return redis.set(
    getReplyKey({ emailAccountId, messageId, ruleId }),
    JSON.stringify({
      reply,
      confidence,
      attachments,
    }),
    {
      ex: ruleId ? 60 * 60 * 24 * 90 : 60 * 60 * 24,
    },
  );
}

function getReplyKey({
  emailAccountId,
  messageId,
  ruleId,
}: {
  emailAccountId: string;
  messageId: string;
  ruleId?: string;
}) {
  return ruleId
    ? `reply:${emailAccountId}:${messageId}:${ruleId}`
    : `reply:${emailAccountId}:${messageId}`;
}

function parseCachedReply(
  cachedReply: string | null,
): ReplyWithConfidence | null {
  if (!cachedReply) return null;

  try {
    const parsed = JSON.parse(cachedReply);
    return parseReplyWithConfidenceFromObject(parsed);
  } catch {
    return null;
  }
}

function parseReplyWithConfidenceFromObject(
  value: unknown,
): ReplyWithConfidence | null {
  if (!value || typeof value !== "object") return null;

  const { attachments, reply, confidence } = value as {
    attachments?: unknown;
    reply?: unknown;
    confidence?: unknown;
  };

  if (typeof reply !== "string") return null;
  if (!isDraftReplyConfidence(confidence)) return null;
  if (
    attachments != null &&
    (!Array.isArray(attachments) ||
      !attachments.every((attachment) => isSelectedAttachment(attachment)))
  ) {
    return null;
  }

  return {
    attachments: attachments as SelectedAttachment[] | undefined,
    reply,
    confidence,
  };
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

function isSelectedAttachment(value: unknown): value is SelectedAttachment {
  if (!value || typeof value !== "object") return false;

  const { driveConnectionId, fileId, filename, mimeType, reason } = value as {
    driveConnectionId?: unknown;
    fileId?: unknown;
    filename?: unknown;
    mimeType?: unknown;
    reason?: unknown;
  };

  return (
    typeof driveConnectionId === "string" &&
    typeof fileId === "string" &&
    typeof filename === "string" &&
    typeof mimeType === "string" &&
    (typeof reason === "string" || reason == null)
  );
}
