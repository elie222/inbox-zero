import { z } from "zod";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import type { ReplyMemory } from "@/generated/prisma/client";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";
import { extractDomainFromEmail, extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { withNetworkRetry } from "@/utils/llms/retry";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";

const REPLY_MEMORY_RETENTION_DAYS = 7;
const MAX_MEMORIES_PER_EDIT = 3;
const MAX_EXISTING_MEMORIES_IN_PROMPT = 12;
const MAX_RETRIEVED_REPLY_MEMORIES = 6;

const replyMemorySchema = z.object({
  memories: z.array(
    z.object({
      title: z.string().trim().min(1).max(120),
      content: z.string().trim().min(1).max(400),
      kind: z.nativeEnum(ReplyMemoryKind),
      scopeType: z.nativeEnum(ReplyMemoryScopeType),
      scopeValue: z.string().trim().max(200),
    }),
  ),
});

const extractionSystemPrompt = `You analyze how a user edits AI-generated email reply drafts and turn durable patterns into reusable drafting memories.

${PROMPT_SECURITY_INSTRUCTIONS}

Return only memories that are likely to help with future drafts.

Memory kinds:
- FACT: reusable factual corrections, business rules, or handling guidance
- STYLE: tone, length, formatting, and phrasing habits

Scopes:
- GLOBAL: applies broadly to the user's replies
- SENDER: applies to one sender email address
- DOMAIN: applies to one sender domain
- TOPIC: applies to a reusable topic or subject area

Rules:
- Return at most ${MAX_MEMORIES_PER_EDIT} memories.
- Skip one-off contextual details that should not be reused later.
- If the edit only changes a meeting time, date, greeting, sign-off, or other thread-specific logistics, return no memory unless the user stated a stable rule.
- Prefer concise, direct drafting instructions.
- Do not infer a durable style preference from a single scheduling choice or one-off availability update.
- Use FACT when the edit adds reusable business information, policy, pricing, product capabilities, constraints, or recurring handling guidance.
- Use STYLE for stable tone, length, formatting, or phrasing preferences.
- For GLOBAL scope, leave scopeValue empty.
- For SENDER scope, use the exact sender email from the context.
- For DOMAIN scope, use the exact sender domain from the context.
- For TOPIC scope, use a short stable topic phrase such as "pricing" or "refunds".
- Always include a scopeValue field. Use an empty string for GLOBAL scope.
- Avoid duplicating an existing memory if the same idea is already covered.
- If nothing durable was learned, return an empty array.`;

export async function saveReplyMemoryEvidence({
  emailAccountId,
  executedActionId,
  sourceMessageId,
  sentMessageId,
  threadId,
  draftText,
  sentText,
  similarityScore,
}: {
  emailAccountId: string;
  executedActionId: string;
  sourceMessageId: string;
  sentMessageId: string;
  threadId: string;
  draftText: string;
  sentText: string;
  similarityScore: number;
}) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + REPLY_MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  return prisma.replyMemoryEvidence.upsert({
    where: { executedActionId },
    create: {
      emailAccountId,
      executedActionId,
      sourceMessageId,
      sentMessageId,
      threadId,
      draftText,
      sentText,
      similarityScore,
      expiresAt,
    },
    update: {
      sourceMessageId,
      sentMessageId,
      threadId,
      draftText,
      sentText,
      similarityScore,
      expiresAt,
    },
  });
}

export async function syncReplyMemoriesFromEvidence({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
}) {
  await prisma.replyMemoryEvidence.deleteMany({
    where: {
      emailAccountId,
      expiresAt: { lte: new Date() },
    },
  });

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccount) return;

  const evidenceRows = await prisma.replyMemoryEvidence.findMany({
    where: {
      emailAccountId,
      processedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  for (const evidence of evidenceRows) {
    try {
      await processReplyMemoryEvidence({
        evidence,
        emailAccount,
        provider,
        logger,
      });
    } catch (error) {
      logger.error("Failed to process reply memory evidence", {
        error,
        replyMemoryEvidenceId: evidence.id,
        executedActionId: evidence.executedActionId,
      });
    }
  }
}

export async function getReplyMemoryContent({
  emailAccountId,
  senderEmail,
  emailContent,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  emailContent: string;
  logger: Logger;
}): Promise<string | null> {
  try {
    const normalizedSenderEmail = senderEmail.trim().toLowerCase();
    const senderDomain = extractDomainFromEmail(
      normalizedSenderEmail,
    ).toLowerCase();
    const normalizedEmailContent = emailContent.trim().toLowerCase();

    const exactMemories = await prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        OR: [
          { scopeType: ReplyMemoryScopeType.GLOBAL },
          {
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: normalizedSenderEmail,
          },
          {
            scopeType: ReplyMemoryScopeType.DOMAIN,
            scopeValue: senderDomain,
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_RETRIEVED_REPLY_MEMORIES,
    });

    const topicMemories = normalizedEmailContent
      ? await prisma.$queryRaw<ReplyMemory[]>`
          SELECT *
          FROM "ReplyMemory"
          WHERE "emailAccountId" = ${emailAccountId}
            AND "scopeType" = CAST(${ReplyMemoryScopeType.TOPIC} AS "ReplyMemoryScopeType")
            AND "scopeValue" <> ''
            AND LOWER(${normalizedEmailContent}) LIKE ('%' || LOWER("scopeValue") || '%')
          ORDER BY LENGTH("scopeValue") DESC, "updatedAt" DESC
          LIMIT ${MAX_RETRIEVED_REPLY_MEMORIES}
        `
      : [];

    const selected = dedupeReplyMemories([
      ...sortReplyMemories(exactMemories),
      ...topicMemories,
    ]).slice(0, MAX_RETRIEVED_REPLY_MEMORIES);

    if (!selected.length) return null;

    return formatReplyMemoryContent(selected);
  } catch (error) {
    logger.error("Failed to load reply memories", { error, emailAccountId });
    return null;
  }
}

export function isMeaningfulDraftEdit({
  draftText,
  sentText,
  similarityScore,
}: {
  draftText: string;
  sentText: string;
  similarityScore: number;
}) {
  if (!draftText.trim() || !sentText.trim()) return false;
  if (similarityScore >= 0.95) return false;

  const normalizedDraft = normalizeMemoryText(draftText);
  const normalizedSent = normalizeMemoryText(sentText);

  if (!normalizedDraft || !normalizedSent) return false;
  if (normalizedDraft === normalizedSent) return false;

  return true;
}

function formatReplyMemoryContent(memories: ReplyMemory[]) {
  return memories
    .map((memory, index) => {
      const scope =
        memory.scopeType === ReplyMemoryScopeType.GLOBAL
          ? "GLOBAL"
          : `${memory.scopeType}:${memory.scopeValue}`;

      return `${index + 1}. [${memory.kind} | ${scope}] ${memory.content}`;
    })
    .join("\n");
}

async function processReplyMemoryEvidence({
  evidence,
  emailAccount,
  provider,
  logger,
}: {
  evidence: {
    id: string;
    sourceMessageId: string;
    draftText: string;
    sentText: string;
    emailAccountId: string;
  };
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
  provider: EmailProvider;
  logger: Logger;
}) {
  const incomingMessage = await provider
    .getMessage(evidence.sourceMessageId)
    .catch((error) => {
      logger.warn("Failed to load source message for reply memory learning", {
        error,
        sourceMessageId: evidence.sourceMessageId,
      });
      return null;
    });

  const senderEmail = extractEmailAddress(incomingMessage?.headers.from || "");
  const senderDomain = extractDomainFromEmail(senderEmail).toLowerCase();

  if (!incomingMessage) {
    logger.warn(
      "Retrying reply memory extraction after source email lookup failed",
      {
        replyMemoryEvidenceId: evidence.id,
        sourceMessageId: evidence.sourceMessageId,
      },
    );
    return;
  }

  if (!senderEmail) {
    logger.warn(
      "Skipping reply memory extraction without source email context",
      {
        replyMemoryEvidenceId: evidence.id,
        sourceMessageId: evidence.sourceMessageId,
        hasIncomingMessage: true,
        hasSenderEmail: false,
      },
    );
    await markReplyMemoryEvidenceProcessed(evidence.id);
    return;
  }

  const existingMemories = await prisma.replyMemory.findMany({
    where: {
      emailAccountId: evidence.emailAccountId,
      OR: getReplyMemoryScopes({
        senderEmail: senderEmail.toLowerCase(),
        senderDomain,
      }),
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_EXISTING_MEMORIES_IN_PROMPT,
  });

  const extracted = await aiExtractReplyMemoriesFromDraftEdit({
    incomingEmailContent: incomingMessage
      ? getEmailForLLM(incomingMessage, {
          maxLength: 2500,
          extractReply: true,
          removeForwarded: false,
        }).content
      : "",
    draftText: evidence.draftText,
    sentText: evidence.sentText,
    senderEmail,
    existingMemories,
    emailAccount,
  });

  for (const memory of extracted) {
    const normalizedScopeValue =
      memory.scopeType === ReplyMemoryScopeType.GLOBAL
        ? ""
        : memory.scopeValue.trim().toLowerCase();

    // Non-global memories need a concrete scope target to be retrievable.
    if (
      memory.scopeType !== ReplyMemoryScopeType.GLOBAL &&
      !normalizedScopeValue
    )
      continue;

    await prisma.replyMemory.upsert({
      where: {
        emailAccountId_kind_scopeType_scopeValue_title: {
          emailAccountId: evidence.emailAccountId,
          kind: memory.kind,
          scopeType: memory.scopeType,
          scopeValue: normalizedScopeValue,
          title: memory.title,
        },
      },
      create: {
        emailAccountId: evidence.emailAccountId,
        title: memory.title,
        content: memory.content,
        kind: memory.kind,
        scopeType: memory.scopeType,
        scopeValue: normalizedScopeValue,
      },
      update: {
        content: memory.content,
      },
    });
  }

  await markReplyMemoryEvidenceProcessed(evidence.id);
}

export async function aiExtractReplyMemoriesFromDraftEdit({
  incomingEmailContent,
  draftText,
  sentText,
  senderEmail,
  existingMemories,
  emailAccount,
}: {
  incomingEmailContent: string;
  draftText: string;
  sentText: string;
  senderEmail: string;
  existingMemories: Pick<
    ReplyMemory,
    "title" | "content" | "kind" | "scopeType" | "scopeValue"
  >[];
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const normalizedIncomingEmailContent = incomingEmailContent.trim();
  const normalizedDraftText = draftText.trim();
  const normalizedSentText = sentText.trim();
  const normalizedSenderEmail = senderEmail.trim().toLowerCase();

  if (!normalizedSenderEmail) return [];
  if (!normalizedDraftText || !normalizedSentText) return [];
  if (
    normalizeMemoryText(normalizedDraftText) ===
    normalizeMemoryText(normalizedSentText)
  ) {
    return [];
  }

  const senderDomain = extractDomainFromEmail(
    normalizedSenderEmail,
  ).toLowerCase();
  const prompt = `<source_email_sender>${normalizedSenderEmail}</source_email_sender>
<source_email_domain>${senderDomain || "unknown"}</source_email_domain>

<incoming_email>
${normalizedIncomingEmailContent}
</incoming_email>

<ai_draft>
${normalizedDraftText}
</ai_draft>

<user_sent>
${normalizedSentText}
</user_sent>

<existing_memories>
${formatExistingMemories(existingMemories)}
</existing_memories>

${getUserInfoPrompt({ emailAccount })}

Extract reusable reply memories from this draft edit.`;

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Reply memory extraction",
    modelOptions,
  });

  const result = await withNetworkRetry(
    () =>
      generateObject({
        ...modelOptions,
        system: extractionSystemPrompt,
        prompt,
        schema: replyMemorySchema,
      }),
    { label: "Reply memory extraction" },
  );

  const normalizedMemories = result.object.memories.map((memory) => ({
    ...memory,
    title: memory.title.trim(),
    content: memory.content.trim(),
    scopeValue:
      memory.scopeType === ReplyMemoryScopeType.GLOBAL
        ? ""
        : memory.scopeValue.trim(),
  }));

  return normalizedMemories;
}

function formatExistingMemories(
  memories: Pick<
    ReplyMemory,
    "title" | "content" | "kind" | "scopeType" | "scopeValue"
  >[],
) {
  if (!memories.length) return "None";

  return memories
    .map(
      (memory, index) =>
        `${index + 1}. [${memory.kind} | ${memory.scopeType}${
          memory.scopeValue ? `:${memory.scopeValue}` : ""
        }] ${memory.title}: ${memory.content}`,
    )
    .join("\n");
}

function normalizeMemoryText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getReplyMemoryScopes({
  senderEmail,
  senderDomain,
}: {
  senderEmail: string;
  senderDomain: string;
}) {
  return [
    { scopeType: ReplyMemoryScopeType.GLOBAL },
    { scopeType: ReplyMemoryScopeType.TOPIC },
    ...(senderEmail
      ? [
          {
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: senderEmail,
          },
        ]
      : []),
    ...(senderDomain
      ? [
          {
            scopeType: ReplyMemoryScopeType.DOMAIN,
            scopeValue: senderDomain,
          },
        ]
      : []),
  ];
}

async function markReplyMemoryEvidenceProcessed(id: string) {
  await prisma.replyMemoryEvidence.update({
    where: { id },
    data: { processedAt: new Date() },
  });
}

function sortReplyMemories(memories: ReplyMemory[]) {
  return [...memories].sort((left, right) => {
    const scopePriority =
      getScopePriority(right.scopeType) - getScopePriority(left.scopeType);
    if (scopePriority !== 0) return scopePriority;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

function dedupeReplyMemories(memories: ReplyMemory[]) {
  const seen = new Set<string>();

  return memories.filter((memory) => {
    if (seen.has(memory.id)) return false;
    seen.add(memory.id);
    return true;
  });
}

function getScopePriority(scopeType: ReplyMemoryScopeType) {
  switch (scopeType) {
    case ReplyMemoryScopeType.SENDER:
      return 3;
    case ReplyMemoryScopeType.DOMAIN:
      return 2;
    case ReplyMemoryScopeType.GLOBAL:
      return 1;
    case ReplyMemoryScopeType.TOPIC:
      return 0;
  }
}
