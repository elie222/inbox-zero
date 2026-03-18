import { z } from "zod";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import type { Prisma, ReplyMemory } from "@/generated/prisma/client";
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
const MAX_REPLY_MEMORY_SOURCE_FETCH_ATTEMPTS = 3;
const MAX_MEMORIES_PER_EDIT = 3;
const MAX_EXISTING_MEMORIES_IN_PROMPT = 12;
const MAX_RETRIEVED_REPLY_MEMORIES = 6;
const MAX_RETRIEVED_TOPIC_REPLY_MEMORIES = 3;
const MIN_STYLE_MEMORIES_FOR_LEARNED_STYLE = 10;
const STYLE_MEMORIES_PER_LEARNED_STYLE_REFRESH = 5;
const MAX_STYLE_MEMORIES_FOR_LEARNED_STYLE = 25;

const replyMemorySchema = z.object({
  memories: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        content: z.string().trim().min(1).max(400),
        kind: z.nativeEnum(ReplyMemoryKind),
        scopeType: z.nativeEnum(ReplyMemoryScopeType),
        scopeValue: z.string().trim().max(200),
      }),
    )
    .max(MAX_MEMORIES_PER_EDIT),
});

const learnedWritingStyleSchema = z.object({
  learnedWritingStyle: z.string().trim().min(1).max(1500),
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

const learnedWritingStyleSystemPrompt = `You maintain a compact learned writing-style summary for an email user based on accumulated style memories from prior draft edits.

${PROMPT_SECURITY_INSTRUCTIONS}

Return a concise prompt-ready style guide that helps draft future emails.

Rules:
- Summarize repeated style patterns, not one-off instructions.
- Focus on directness, verbosity, greeting habits, sign-off habits, paragraph structure, formatting, and how much filler the user removes.
- Keep it under 1500 characters.
- Include two sections exactly:
  1. "Observed patterns:" with 2-5 bullets
  2. "Representative edits:" with 2-3 short bullets
- Representative edits should be short paraphrases of draft-to-send changes, not full email quotes.
- Do not mention names, email addresses, company names, phone numbers, dates, links, or other identifying details.
- This learned summary is advisory and should complement, not replace, explicit user-written style settings.`;

export async function saveDraftSendLogReplyMemory({
  draftSendLogId,
  sentText,
}: {
  draftSendLogId: string;
  sentText: string;
}) {
  return prisma.draftSendLog.update({
    where: { id: draftSendLogId },
    data: {
      replyMemorySentText: sentText,
      replyMemoryAttemptCount: 0,
      replyMemoryProcessedAt: null,
    },
  });
}

export async function syncReplyMemoriesFromDraftSendLogs({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
}) {
  const retentionCutoff = new Date(
    Date.now() - REPLY_MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.draftSendLog.updateMany({
    where: {
      createdAt: { lte: retentionCutoff },
      replyMemorySentText: { not: null },
      executedAction: {
        executedRule: {
          emailAccountId,
        },
      },
    },
    data: {
      replyMemorySentText: null,
    },
  });

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccount) return;

  const draftSendLogs = await prisma.draftSendLog.findMany({
    where: {
      createdAt: { gt: retentionCutoff },
      replyMemoryAttemptCount: {
        lt: MAX_REPLY_MEMORY_SOURCE_FETCH_ATTEMPTS,
      },
      replyMemoryProcessedAt: null,
      replyMemorySentText: { not: null },
      executedAction: {
        executedRule: {
          emailAccountId,
        },
      },
    },
    include: draftSendLogReplyMemoryInclude,
    orderBy: [{ replyMemoryAttemptCount: "asc" }, { createdAt: "asc" }],
    take: 5,
  });

  for (const draftSendLog of draftSendLogs) {
    try {
      await processReplyMemoryDraftSendLog({
        draftSendLog,
        emailAccount,
        provider,
        logger,
      });
    } catch (error) {
      logger.error("Failed to process reply memory draft send log", {
        error,
        draftSendLogId: draftSendLog.id,
        executedActionId: draftSendLog.executedAction.id,
      });

      try {
        await recordDraftSendLogReplyMemoryFailure(draftSendLog);
      } catch (recordError) {
        logger.error("Failed to record reply memory draft send log failure", {
          error: recordError,
          draftSendLogId: draftSendLog.id,
        });
      }
    }
  }

  try {
    await maybeRefreshLearnedWritingStyle({ emailAccountId, emailAccount });
  } catch (error) {
    logger.error("Failed to refresh learned writing style", {
      error,
      emailAccountId,
    });
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
  const result = await getReplyMemoriesForPrompt({
    emailAccountId,
    senderEmail,
    emailContent,
    logger,
  });

  return result.content;
}

export async function getReplyMemoriesForPrompt({
  emailAccountId,
  senderEmail,
  emailContent,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  emailContent: string;
  logger: Logger;
}): Promise<{
  content: string | null;
  selectedMemories: Array<Pick<ReplyMemory, "id" | "kind" | "scopeType">>;
}> {
  try {
    const normalizedSenderEmail = senderEmail.trim().toLowerCase();
    const senderDomain = extractDomainFromEmail(
      normalizedSenderEmail,
    ).toLowerCase();
    const normalizedEmailContent = emailContent.trim().toLowerCase();
    const [senderMemories, domainMemories, globalMemories] = await Promise.all([
      normalizedSenderEmail
        ? fetchReplyMemoriesByScope({
            emailAccountId,
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: normalizedSenderEmail,
          })
        : Promise.resolve([]),
      senderDomain
        ? fetchReplyMemoriesByScope({
            emailAccountId,
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.DOMAIN,
            scopeValue: senderDomain,
          })
        : Promise.resolve([]),
      fetchReplyMemoriesByScope({
        emailAccountId,
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }),
    ]);

    const topicMemories = normalizedEmailContent
      ? await prisma.$queryRaw<ReplyMemory[]>`
          SELECT *
          FROM "ReplyMemory"
          WHERE "emailAccountId" = ${emailAccountId}
            AND "kind" = CAST(${ReplyMemoryKind.FACT} AS "ReplyMemoryKind")
            AND "scopeType" = CAST(${ReplyMemoryScopeType.TOPIC} AS "ReplyMemoryScopeType")
            AND "scopeValue" <> ''
            AND LOWER(${normalizedEmailContent}) LIKE ('%' || LOWER("scopeValue") || '%')
          ORDER BY LENGTH("scopeValue") DESC, "updatedAt" DESC
          LIMIT ${MAX_RETRIEVED_TOPIC_REPLY_MEMORIES}
        `
      : [];

    const selected = dedupeReplyMemories(
      sortReplyMemories([
        ...senderMemories,
        ...domainMemories,
        ...globalMemories,
        ...topicMemories,
      ]),
    ).slice(0, MAX_RETRIEVED_REPLY_MEMORIES);

    if (!selected.length) {
      return {
        content: null,
        selectedMemories: [],
      };
    }

    return {
      content: formatReplyMemoryContent(selected),
      selectedMemories: selected.map((memory) => ({
        id: memory.id,
        kind: memory.kind,
        scopeType: memory.scopeType,
      })),
    };
  } catch (error) {
    logger.error("Failed to load reply memories", { error, emailAccountId });
    return {
      content: null,
      selectedMemories: [],
    };
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

async function processReplyMemoryDraftSendLog({
  draftSendLog,
  emailAccount,
  provider,
  logger,
}: {
  draftSendLog: DraftSendLogReplyMemoryPayload;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
  provider: EmailProvider;
  logger: Logger;
}) {
  const sourceMessageId = draftSendLog.executedAction.executedRule.messageId;
  const emailAccountId =
    draftSendLog.executedAction.executedRule.emailAccountId;
  const draftText = draftSendLog.executedAction.content ?? "";

  const incomingMessage = await provider
    .getMessage(sourceMessageId)
    .catch((error) => {
      logger.warn("Failed to load source message for reply memory learning", {
        error,
        sourceMessageId,
      });
      return null;
    });

  const senderEmail = extractEmailAddress(incomingMessage?.headers.from || "");
  const senderDomain = extractDomainFromEmail(senderEmail).toLowerCase();
  const normalizedSenderEmail = senderEmail.toLowerCase();

  if (!incomingMessage) {
    logger.warn(
      "Retrying reply memory extraction after source email lookup failed",
      {
        draftSendLogId: draftSendLog.id,
        sourceMessageId,
      },
    );
    await recordDraftSendLogReplyMemoryFailure(draftSendLog);
    return;
  }

  if (!senderEmail) {
    logger.warn(
      "Skipping reply memory extraction without source email context",
      {
        draftSendLogId: draftSendLog.id,
        sourceMessageId,
        hasIncomingMessage: true,
        hasSenderEmail: false,
      },
    );
    await markDraftSendLogReplyMemoryProcessed(draftSendLog.id);
    return;
  }

  const [existingMemories, learnedWritingStyle] = await Promise.all([
    prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        kind: ReplyMemoryKind.FACT,
        OR: getReplyMemoryScopes({
          senderEmail: normalizedSenderEmail,
          senderDomain,
        }),
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_EXISTING_MEMORIES_IN_PROMPT,
    }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { learnedWritingStyle: true },
    }),
  ]);

  const extracted = await aiExtractReplyMemoriesFromDraftEdit({
    incomingEmailContent: incomingMessage
      ? getEmailForLLM(incomingMessage, {
          maxLength: 2500,
          extractReply: true,
          removeForwarded: false,
        }).content
      : "",
    draftText,
    sentText: draftSendLog.replyMemorySentText ?? "",
    senderEmail: normalizedSenderEmail,
    existingMemories,
    learnedWritingStyle: learnedWritingStyle?.learnedWritingStyle ?? null,
    emailAccount,
  });

  for (const memory of extracted) {
    const normalizedScopeValue = getNormalizedReplyMemoryScopeValue({
      memory,
      senderEmail: normalizedSenderEmail,
      senderDomain,
    });

    // Non-global memories need a concrete scope target to be retrievable.
    if (
      memory.scopeType !== ReplyMemoryScopeType.GLOBAL &&
      !normalizedScopeValue
    )
      continue;

    const persistedMemory = await prisma.replyMemory.upsert({
      where: {
        emailAccountId_kind_scopeType_scopeValue_title: {
          emailAccountId,
          kind: memory.kind,
          scopeType: memory.scopeType,
          scopeValue: normalizedScopeValue,
          title: memory.title,
        },
      },
      create: {
        emailAccountId,
        title: memory.title,
        content: memory.content,
        kind: memory.kind,
        scopeType: memory.scopeType,
        scopeValue: normalizedScopeValue,
        ...(memory.kind === ReplyMemoryKind.STYLE
          ? { learnedWritingStyleAnalyzedAt: null }
          : {}),
      },
      update: {
        content: memory.content,
        ...(memory.kind === ReplyMemoryKind.STYLE
          ? { learnedWritingStyleAnalyzedAt: null }
          : {}),
      },
    });

    await prisma.replyMemorySource.upsert({
      where: {
        replyMemoryId_draftSendLogId: {
          replyMemoryId: persistedMemory.id,
          draftSendLogId: draftSendLog.id,
        },
      },
      create: {
        replyMemoryId: persistedMemory.id,
        draftSendLogId: draftSendLog.id,
      },
      update: {},
    });
  }

  await markDraftSendLogReplyMemoryProcessed(draftSendLog.id);
}

export async function aiExtractReplyMemoriesFromDraftEdit({
  incomingEmailContent,
  draftText,
  sentText,
  senderEmail,
  existingMemories,
  learnedWritingStyle = null,
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
  learnedWritingStyle?: string | null;
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
  const learnedWritingStylePrompt = learnedWritingStyle
    ? `<learned_writing_style>
${learnedWritingStyle}
</learned_writing_style>
`
    : "";
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

${learnedWritingStylePrompt}

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

  return normalizedMemories.slice(0, MAX_MEMORIES_PER_EDIT);
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

async function fetchReplyMemoriesByScope({
  emailAccountId,
  kind,
  scopeType,
  scopeValue,
}: {
  emailAccountId: string;
  kind: ReplyMemoryKind;
  scopeType: ReplyMemoryScopeType;
  scopeValue?: string;
}) {
  return prisma.replyMemory.findMany({
    where: {
      emailAccountId,
      kind,
      scopeType,
      ...(scopeValue !== undefined ? { scopeValue } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_RETRIEVED_REPLY_MEMORIES,
  });
}

async function maybeRefreshLearnedWritingStyle({
  emailAccountId,
  emailAccount,
}: {
  emailAccountId: string;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const [
    learnedWritingStyleState,
    styleMemoryCount,
    unanalyzedStyleMemoryCount,
  ] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { learnedWritingStyle: true },
    }),
    prisma.replyMemory.count({
      where: {
        emailAccountId,
        kind: ReplyMemoryKind.STYLE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      },
    }),
    prisma.replyMemory.count({
      where: {
        emailAccountId,
        kind: ReplyMemoryKind.STYLE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        learnedWritingStyleAnalyzedAt: null,
      },
    }),
  ]);

  if (!learnedWritingStyleState?.learnedWritingStyle) {
    if (styleMemoryCount < MIN_STYLE_MEMORIES_FOR_LEARNED_STYLE) return;
  } else if (
    unanalyzedStyleMemoryCount < STYLE_MEMORIES_PER_LEARNED_STYLE_REFRESH
  ) {
    return;
  }

  const [unanalyzedStyleMemories, analyzedStyleMemories] = await Promise.all([
    prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        kind: ReplyMemoryKind.STYLE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        learnedWritingStyleAnalyzedAt: null,
      },
      include: styleMemoryCompactionInclude,
      orderBy: { updatedAt: "desc" },
      take: MAX_STYLE_MEMORIES_FOR_LEARNED_STYLE,
    }),
    prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        kind: ReplyMemoryKind.STYLE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        learnedWritingStyleAnalyzedAt: {
          not: null,
        },
      },
      include: styleMemoryCompactionInclude,
      orderBy: { updatedAt: "desc" },
      take: MAX_STYLE_MEMORIES_FOR_LEARNED_STYLE,
    }),
  ]);

  const styleMemories = [...unanalyzedStyleMemories];
  const seenMemoryIds = new Set(styleMemories.map((memory) => memory.id));
  for (const memory of analyzedStyleMemories) {
    if (seenMemoryIds.has(memory.id)) continue;
    styleMemories.push(memory);
    seenMemoryIds.add(memory.id);
    if (styleMemories.length >= MAX_STYLE_MEMORIES_FOR_LEARNED_STYLE) break;
  }

  if (!styleMemories.length) return;

  const learnedWritingStyle = await summarizeLearnedWritingStyle({
    styleMemories,
    emailAccount,
  });

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { learnedWritingStyle },
  });

  const analyzedMemoryIds = styleMemories
    .filter((memory) => memory.learnedWritingStyleAnalyzedAt === null)
    .map((memory) => memory.id);

  if (!analyzedMemoryIds.length) return;

  await prisma.replyMemory.updateMany({
    where: {
      id: { in: analyzedMemoryIds },
    },
    data: {
      learnedWritingStyleAnalyzedAt: new Date(),
    },
  });
}

async function summarizeLearnedWritingStyle({
  styleMemories,
  emailAccount,
}: {
  styleMemories: StyleMemoryCompactionPayload[];
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const prompt = `<style_memory_evidence>
${formatStyleMemoryEvidence(styleMemories)}
</style_memory_evidence>

${getUserInfoPrompt({ emailAccount })}

Summarize the user's learned writing style from this evidence.`;

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Learned writing style compaction",
    modelOptions,
  });

  const result = await withNetworkRetry(
    () =>
      generateObject({
        ...modelOptions,
        system: learnedWritingStyleSystemPrompt,
        prompt,
        schema: learnedWritingStyleSchema,
      }),
    { label: "Learned writing style compaction" },
  );

  return result.object.learnedWritingStyle.trim();
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

async function markDraftSendLogReplyMemoryProcessed(id: string) {
  await prisma.draftSendLog.update({
    where: { id },
    data: {
      replyMemoryProcessedAt: new Date(),
      replyMemorySentText: null,
    },
  });
}

async function recordDraftSendLogReplyMemoryFailure(
  draftSendLog: Pick<
    DraftSendLogReplyMemoryPayload,
    "id" | "replyMemoryAttemptCount"
  >,
) {
  const nextAttemptCount = draftSendLog.replyMemoryAttemptCount + 1;

  await prisma.draftSendLog.update({
    where: { id: draftSendLog.id },
    data:
      nextAttemptCount >= MAX_REPLY_MEMORY_SOURCE_FETCH_ATTEMPTS
        ? {
            replyMemoryAttemptCount: { increment: 1 },
            replyMemoryProcessedAt: new Date(),
            replyMemorySentText: null,
          }
        : {
            replyMemoryAttemptCount: { increment: 1 },
          },
  });
}

const draftSendLogReplyMemoryInclude = {
  executedAction: {
    select: {
      id: true,
      content: true,
      executedRule: {
        select: {
          emailAccountId: true,
          messageId: true,
        },
      },
    },
  },
} satisfies Prisma.DraftSendLogInclude;

type DraftSendLogReplyMemoryPayload = Prisma.DraftSendLogGetPayload<{
  include: typeof draftSendLogReplyMemoryInclude;
}>;

const styleMemoryCompactionInclude = {
  sources: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: {
      draftSendLog: {
        select: {
          replyMemorySentText: true,
          executedAction: {
            select: {
              content: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ReplyMemoryInclude;

type StyleMemoryCompactionPayload = Prisma.ReplyMemoryGetPayload<{
  include: typeof styleMemoryCompactionInclude;
}>;

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
    case ReplyMemoryScopeType.TOPIC:
      return 1;
    case ReplyMemoryScopeType.GLOBAL:
      return 0;
  }
}

function getNormalizedReplyMemoryScopeValue({
  memory,
  senderEmail,
  senderDomain,
}: {
  memory: Pick<
    z.infer<typeof replyMemorySchema>["memories"][number],
    "scopeType" | "scopeValue"
  >;
  senderEmail: string;
  senderDomain: string;
}) {
  switch (memory.scopeType) {
    case ReplyMemoryScopeType.GLOBAL:
      return "";
    case ReplyMemoryScopeType.SENDER:
      return senderEmail;
    case ReplyMemoryScopeType.DOMAIN:
      return senderDomain;
    case ReplyMemoryScopeType.TOPIC:
      return memory.scopeValue.trim().toLowerCase();
  }
}

function formatStyleMemoryEvidence(
  styleMemories: StyleMemoryCompactionPayload[],
) {
  return styleMemories
    .map((memory, index) => {
      const source = memory.sources[0];
      const draftText = source?.draftSendLog.executedAction.content ?? "";
      const sentText = source?.draftSendLog.replyMemorySentText ?? "";

      return `${index + 1}. ${memory.title}: ${memory.content}
Draft example: ${truncateStyleEvidenceText(draftText) || "None"}
Sent example: ${truncateStyleEvidenceText(sentText) || "None"}`;
    })
    .join("\n\n");
}

function truncateStyleEvidenceText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 280
    ? `${normalized.slice(0, 277).trimEnd()}...`
    : normalized;
}
