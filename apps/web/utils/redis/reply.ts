import { DraftReplyConfidence } from "@/generated/prisma/enums";
import {
  draftContextMetadataSchema,
  type DraftContextMetadata,
} from "@/utils/ai/reply/draft-context-metadata";
import type { DraftAttribution } from "@/utils/ai/reply/draft-attribution";
import {
  selectedAttachmentSchema,
  type SelectedAttachment,
} from "@/utils/attachments/source-schema";
import { redis } from "@/utils/redis";

export type ReplyWithConfidence = {
  attachments?: SelectedAttachment[];
  reply: string;
  confidence: DraftReplyConfidence;
  attribution: DraftAttribution | null;
  draftContextMetadata: DraftContextMetadata | null;
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
  attribution,
  draftContextMetadata,
  attachments,
  ruleId,
}: {
  emailAccountId: string;
  messageId: string;
  reply: string;
  confidence: DraftReplyConfidence;
  attribution?: DraftAttribution | null;
  draftContextMetadata?: DraftContextMetadata | null;
  attachments?: SelectedAttachment[];
  ruleId?: string;
}) {
  return redis.set(
    getReplyKey({ emailAccountId, messageId, ruleId }),
    JSON.stringify({
      reply,
      confidence,
      ...(attribution !== undefined ? { attribution } : {}),
      ...(draftContextMetadata !== undefined ? { draftContextMetadata } : {}),
      ...(attachments !== undefined ? { attachments } : {}),
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

  const { attachments, reply, confidence, attribution, draftContextMetadata } =
    value as {
      attachments?: unknown;
      reply?: unknown;
      confidence?: unknown;
      attribution?: unknown;
      draftContextMetadata?: unknown;
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
    attribution: parseDraftAttribution(attribution),
    draftContextMetadata: parseDraftContextMetadata(draftContextMetadata),
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

function parseDraftAttribution(value: unknown): DraftAttribution | null {
  if (!value || typeof value !== "object") return null;

  const { provider, modelName, pipelineVersion } = value as {
    provider?: unknown;
    modelName?: unknown;
    pipelineVersion?: unknown;
  };

  if (typeof provider !== "string") return null;
  if (typeof modelName !== "string") return null;
  if (typeof pipelineVersion !== "number" || Number.isNaN(pipelineVersion)) {
    return null;
  }

  return { provider, modelName, pipelineVersion };
}

function parseDraftContextMetadata(
  value: unknown,
): DraftContextMetadata | null {
  const result = draftContextMetadataSchema.safeParse(value);
  return result.success ? result.data : null;
}

function isSelectedAttachment(value: unknown): value is SelectedAttachment {
  return selectedAttachmentSchema.safeParse(value).success;
}
