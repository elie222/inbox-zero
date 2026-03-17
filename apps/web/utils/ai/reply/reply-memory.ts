import { z } from "zod";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
  ReplyMemoryStatus,
} from "@/generated/prisma/enums";
import type { ReplyMemory } from "@/generated/prisma/client";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";
import { extractDomainFromEmail, extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";

const REPLY_MEMORY_RETENTION_DAYS = 7;
const MAX_MEMORIES_PER_EDIT = 3;
const MAX_EXISTING_MEMORIES_IN_PROMPT = 12;
const MAX_RETRIEVED_REPLY_MEMORIES = 6;
const TOPIC_SCOPE_MIN_OVERLAP = 1;

const replyMemorySchema = z.object({
  memories: z.array(
    z.object({
      title: z.string().trim().min(1).max(120),
      content: z.string().trim().min(1).max(400),
      kind: z.nativeEnum(ReplyMemoryKind),
      scopeType: z.nativeEnum(ReplyMemoryScopeType),
      scopeValue: z.string().trim().max(200),
      tags: z.array(z.string().trim().min(1).max(40)).max(6),
    }),
  ),
});

const extractionSystemPrompt = `You analyze how a user edits AI-generated email reply drafts and turn durable patterns into reusable drafting memories.

${PROMPT_SECURITY_INSTRUCTIONS}

Return only memories that are likely to help with future drafts.

Memory kinds:
- FACT: reusable factual corrections or answers
- PROCESS: repeatable workflow or handling instructions
- PREFERENCE: stable user preferences
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
- Do not infer a durable preference from a single scheduling choice or one-off availability update.
- Use FACT when the edit adds reusable business information, policy, pricing, product capabilities, or constraints.
- Use PROCESS only for repeatable workflow steps the assistant should follow.
- For GLOBAL scope, leave scopeValue empty.
- For SENDER scope, use the exact sender email from the context.
- For DOMAIN scope, use the exact sender domain from the context.
- For TOPIC scope, use a short stable topic phrase such as "pricing" or "refunds".
- Always include a scopeValue field. Use an empty string for GLOBAL scope.
- Always include a tags field. Use an empty array when no tags are useful.
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
    const senderDomain = extractDomainFromEmail(senderEmail).toLowerCase();
    const memories = await prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        status: ReplyMemoryStatus.ACTIVE,
        OR: [
          { scopeType: ReplyMemoryScopeType.GLOBAL },
          {
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: senderEmail.toLowerCase(),
          },
          {
            scopeType: ReplyMemoryScopeType.DOMAIN,
            scopeValue: senderDomain,
          },
          { scopeType: ReplyMemoryScopeType.TOPIC },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const selected = selectReplyMemories({
      memories,
      senderEmail,
      senderDomain,
      emailContent,
    });

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

function selectReplyMemories({
  memories,
  senderEmail,
  senderDomain,
  emailContent,
}: {
  memories: ReplyMemory[];
  senderEmail: string;
  senderDomain: string;
  emailContent: string;
}) {
  const normalizedSenderEmail = senderEmail.toLowerCase();
  const normalizedSenderDomain = senderDomain.toLowerCase();
  const emailTokens = tokenize(emailContent);

  const scored = memories
    .map((memory) => {
      const score = scoreReplyMemory({
        memory,
        normalizedSenderEmail,
        normalizedSenderDomain,
        emailTokens,
      });

      return { memory, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.memory.updatedAt.getTime() - left.memory.updatedAt.getTime();
    });

  return scored
    .slice(0, MAX_RETRIEVED_REPLY_MEMORIES)
    .map((item) => item.memory);
}

function scoreReplyMemory({
  memory,
  normalizedSenderEmail,
  normalizedSenderDomain,
  emailTokens,
}: {
  memory: ReplyMemory;
  normalizedSenderEmail: string;
  normalizedSenderDomain: string;
  emailTokens: Set<string>;
}) {
  if (
    memory.scopeType === ReplyMemoryScopeType.SENDER &&
    memory.scopeValue.toLowerCase() !== normalizedSenderEmail
  ) {
    return 0;
  }

  if (
    memory.scopeType === ReplyMemoryScopeType.DOMAIN &&
    memory.scopeValue.toLowerCase() !== normalizedSenderDomain
  ) {
    return 0;
  }

  const memoryText = [memory.title, memory.content, ...memory.tags].join(" ");
  const memoryTokens = tokenize(memoryText);
  const overlapCount = countOverlap(emailTokens, memoryTokens);

  if (
    memory.scopeType === ReplyMemoryScopeType.TOPIC &&
    overlapCount < TOPIC_SCOPE_MIN_OVERLAP
  ) {
    return 0;
  }

  let score = 0;

  if (memory.scopeType === ReplyMemoryScopeType.SENDER) score += 120;
  if (memory.scopeType === ReplyMemoryScopeType.DOMAIN) score += 90;
  if (memory.scopeType === ReplyMemoryScopeType.GLOBAL) score += 15;
  if (memory.scopeType === ReplyMemoryScopeType.TOPIC) score += 35;

  if (
    memory.scopeType === ReplyMemoryScopeType.GLOBAL &&
    (memory.kind === ReplyMemoryKind.PREFERENCE ||
      memory.kind === ReplyMemoryKind.STYLE)
  ) {
    score += 35;
  }

  score += overlapCount * 8;

  return score;
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

  const existingMemories = await prisma.replyMemory.findMany({
    where: {
      emailAccountId: evidence.emailAccountId,
      status: ReplyMemoryStatus.ACTIVE,
      OR: senderDomain
        ? [
            { scopeType: ReplyMemoryScopeType.GLOBAL },
            {
              scopeType: ReplyMemoryScopeType.SENDER,
              scopeValue: senderEmail.toLowerCase(),
            },
            {
              scopeType: ReplyMemoryScopeType.DOMAIN,
              scopeValue: senderDomain,
            },
          ]
        : [{ scopeType: ReplyMemoryScopeType.GLOBAL }],
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
    senderDomain,
    existingMemories,
    emailAccount,
  });

  for (const memory of extracted) {
    const normalizedScopeValue =
      memory.scopeType === ReplyMemoryScopeType.GLOBAL
        ? ""
        : memory.scopeValue.trim().toLowerCase();

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
        tags: normalizeTags(memory.tags),
        kind: memory.kind,
        scopeType: memory.scopeType,
        scopeValue: normalizedScopeValue,
      },
      update: {
        content: memory.content,
        tags: normalizeTags(memory.tags),
        status: ReplyMemoryStatus.ACTIVE,
      },
    });
  }

  await prisma.replyMemoryEvidence.update({
    where: { id: evidence.id },
    data: { processedAt: new Date() },
  });
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
  const senderDomain = extractDomainFromEmail(senderEmail).toLowerCase();
  const prompt = `<source_email_sender>${senderEmail || "unknown"}</source_email_sender>
<source_email_domain>${senderDomain || "unknown"}</source_email_domain>

<incoming_email>
${incomingEmailContent || "Unavailable"}
</incoming_email>

<ai_draft>
${draftText}
</ai_draft>

<user_sent>
${sentText}
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

  const result = await generateObject({
    ...modelOptions,
    system: extractionSystemPrompt,
    prompt,
    schema: replyMemorySchema,
  });

  const normalizedMemories = result.object.memories.map((memory) => ({
    ...memory,
    title: memory.title.trim(),
    content: memory.content.trim(),
    scopeValue:
      memory.scopeType === ReplyMemoryScopeType.GLOBAL
        ? ""
        : memory.scopeValue.trim(),
    tags: normalizeTags(memory.tags),
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

function normalizeTags(tags: string[]) {
  return Array.from(
    new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 6);
}

function normalizeMemoryText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return new Set(
    normalizeMemoryText(value)
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.filter((token) => !STOP_WORDS.has(token)) ?? [],
  );
}

function countOverlap(left: Set<string>, right: Set<string>) {
  let count = 0;

  for (const value of left) {
    if (right.has(value)) count += 1;
  }

  return count;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "from",
  "have",
  "into",
  "just",
  "more",
  "that",
  "than",
  "their",
  "them",
  "they",
  "this",
  "your",
  "with",
]);
