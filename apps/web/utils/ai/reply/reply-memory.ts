import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import type { Prisma, ReplyMemory } from "@/generated/prisma/client";
import { extractDomainFromEmail, extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { aiExtractReplyMemoriesFromDraftEdit } from "./extract-reply-memories";
import { aiSummarizeLearnedWritingStyle } from "./summarize-learned-writing-style";

const REPLY_MEMORY_RETENTION_DAYS = 7;
const MAX_REPLY_MEMORY_SOURCE_FETCH_ATTEMPTS = 3;
const MAX_EXISTING_MEMORIES_IN_PROMPT = 12;
const MAX_EXISTING_PREFERENCE_MEMORIES_IN_PROMPT = 4;
const MAX_RETRIEVED_REPLY_MEMORIES = 6;
const MAX_RETRIEVED_TOPIC_REPLY_MEMORIES = 3;
const PROMPTABLE_REPLY_MEMORY_KINDS = [
  ReplyMemoryKind.FACT,
  ReplyMemoryKind.PROCEDURE,
];
const MIN_PREFERENCE_EVIDENCE_FOR_LEARNED_STYLE = 10;
const PREFERENCE_EVIDENCE_PER_LEARNED_STYLE_REFRESH = 5;
const MAX_PREFERENCE_EVIDENCE_FOR_LEARNED_STYLE = 25;

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
            kinds: PROMPTABLE_REPLY_MEMORY_KINDS,
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: normalizedSenderEmail,
          })
        : Promise.resolve([]),
      senderDomain
        ? fetchReplyMemoriesByScope({
            emailAccountId,
            kinds: PROMPTABLE_REPLY_MEMORY_KINDS,
            scopeType: ReplyMemoryScopeType.DOMAIN,
            scopeValue: senderDomain,
          })
        : Promise.resolve([]),
      fetchReplyMemoriesByScope({
        emailAccountId,
        kinds: PROMPTABLE_REPLY_MEMORY_KINDS,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }),
    ]);

    const topicMemories = normalizedEmailContent
      ? await prisma.$queryRaw<ReplyMemory[]>`
          SELECT *
          FROM "ReplyMemory"
          WHERE "emailAccountId" = ${emailAccountId}
            AND (
              "kind" = CAST(${ReplyMemoryKind.FACT} AS "ReplyMemoryKind")
              OR "kind" = CAST(${ReplyMemoryKind.PROCEDURE} AS "ReplyMemoryKind")
            )
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

  const [
    existingPromptableMemories,
    existingPreferenceMemories,
    writingContext,
  ] = await Promise.all([
    prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        kind: { in: PROMPTABLE_REPLY_MEMORY_KINDS },
        OR: getReplyMemoryScopes({
          senderEmail: normalizedSenderEmail,
          senderDomain,
        }),
      },
      orderBy: { updatedAt: "desc" },
      take:
        MAX_EXISTING_MEMORIES_IN_PROMPT -
        MAX_EXISTING_PREFERENCE_MEMORIES_IN_PROMPT,
    }),
    prisma.replyMemory.findMany({
      where: {
        emailAccountId,
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        isLearnedStyleEvidence: true,
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_EXISTING_PREFERENCE_MEMORIES_IN_PROMPT,
    }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { learnedWritingStyle: true, writingStyle: true },
    }),
  ]);

  const existingMemories = [
    ...existingPromptableMemories,
    ...existingPreferenceMemories,
  ];

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
    writingStyle: writingContext?.writingStyle ?? null,
    learnedWritingStyle: writingContext?.learnedWritingStyle ?? null,
    emailAccount,
  });

  let attachedExistingCount = 0;
  let createdMemoryCount = 0;

  for (const extractedMemory of extracted) {
    const matchingExistingMemory = extractedMemory.matchingExistingMemoryId
      ? (existingMemories.find(
          (memory) => memory.id === extractedMemory.matchingExistingMemoryId,
        ) ?? null)
      : null;

    if (
      extractedMemory.matchingExistingMemoryId &&
      !matchingExistingMemory &&
      !extractedMemory.newMemory
    ) {
      logger.warn(
        "Reply memory extraction returned unknown existing memory id",
        {
          emailAccountId,
          draftSendLogId: draftSendLog.id,
          matchingExistingMemoryId: extractedMemory.matchingExistingMemoryId,
        },
      );
      continue;
    }

    if (matchingExistingMemory) {
      const persistedMemory = await prisma.replyMemory.update({
        where: { id: matchingExistingMemory.id },
        data: {
          isLearnedStyleEvidence:
            matchingExistingMemory.kind === ReplyMemoryKind.PREFERENCE,
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

      attachedExistingCount += 1;
      continue;
    }

    if (!extractedMemory.newMemory) continue;

    const normalizedMemory =
      extractedMemory.newMemory.kind === ReplyMemoryKind.PREFERENCE
        ? {
            ...extractedMemory.newMemory,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }
        : extractedMemory.newMemory;

    const normalizedScopeValue = getNormalizedReplyMemoryScopeValue({
      memory: normalizedMemory,
      senderEmail: normalizedSenderEmail,
      senderDomain,
    });

    // Non-global memories need a concrete scope target to be retrievable.
    if (
      normalizedMemory.scopeType !== ReplyMemoryScopeType.GLOBAL &&
      !normalizedScopeValue
    )
      continue;

    const where = {
      emailAccountId_kind_scopeType_scopeValue_content: {
        emailAccountId,
        kind: normalizedMemory.kind,
        scopeType: normalizedMemory.scopeType,
        scopeValue: normalizedScopeValue,
        content: normalizedMemory.content,
      },
    } satisfies Prisma.ReplyMemoryWhereUniqueInput;

    const isLearnedStyleEvidence =
      normalizedMemory.kind === ReplyMemoryKind.PREFERENCE;

    const persistedMemory = await prisma.replyMemory.upsert({
      where,
      create: {
        emailAccountId,
        content: normalizedMemory.content,
        kind: normalizedMemory.kind,
        scopeType: normalizedMemory.scopeType,
        scopeValue: normalizedScopeValue,
        isLearnedStyleEvidence,
      },
      update: {
        content: normalizedMemory.content,
        isLearnedStyleEvidence,
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

    createdMemoryCount += 1;
  }

  if (extracted.length > 0) {
    logger.info("Processed reply memory extraction decisions", {
      emailAccountId,
      draftSendLogId: draftSendLog.id,
      decisionCount: extracted.length,
      attachedExistingCount,
      createdMemoryCount,
    });
  }

  await markDraftSendLogReplyMemoryProcessed(draftSendLog.id, {
    keepSentText: true,
  });
}

async function fetchReplyMemoriesByScope({
  emailAccountId,
  kinds,
  scopeType,
  scopeValue,
}: {
  emailAccountId: string;
  kinds: ReplyMemoryKind[];
  scopeType: ReplyMemoryScopeType;
  scopeValue?: string;
}) {
  return prisma.replyMemory.findMany({
    where: {
      emailAccountId,
      kind: { in: kinds },
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
  const preferenceEvidenceMemoryFilter = {
    replyMemory: {
      is: {
        emailAccountId,
        kind: ReplyMemoryKind.PREFERENCE,
        isLearnedStyleEvidence: true,
      },
    },
  } as const;

  const [
    learnedWritingStyleState,
    preferenceEvidenceCount,
    unanalyzedPreferenceEvidenceCount,
  ] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { learnedWritingStyle: true },
    }),
    prisma.replyMemorySource.count({
      where: preferenceEvidenceMemoryFilter,
    }),
    prisma.replyMemorySource.count({
      where: {
        learnedWritingStyleAnalyzedAt: null,
        ...preferenceEvidenceMemoryFilter,
      },
    }),
  ]);

  if (!learnedWritingStyleState?.learnedWritingStyle) {
    if (preferenceEvidenceCount < MIN_PREFERENCE_EVIDENCE_FOR_LEARNED_STYLE) {
      return;
    }
  } else if (
    unanalyzedPreferenceEvidenceCount <
    PREFERENCE_EVIDENCE_PER_LEARNED_STYLE_REFRESH
  ) {
    return;
  }

  const [unanalyzedPreferenceEvidence, analyzedPreferenceEvidence] =
    await Promise.all([
      prisma.replyMemorySource.findMany({
        where: {
          learnedWritingStyleAnalyzedAt: null,
          ...preferenceEvidenceMemoryFilter,
        },
        include: preferenceWritingEvidenceInclude,
        orderBy: { createdAt: "desc" },
        take: MAX_PREFERENCE_EVIDENCE_FOR_LEARNED_STYLE,
      }),
      prisma.replyMemorySource.findMany({
        where: {
          learnedWritingStyleAnalyzedAt: { not: null },
          ...preferenceEvidenceMemoryFilter,
        },
        include: preferenceWritingEvidenceInclude,
        orderBy: { createdAt: "desc" },
        take: MAX_PREFERENCE_EVIDENCE_FOR_LEARNED_STYLE,
      }),
    ]);

  const preferenceEvidence = [...unanalyzedPreferenceEvidence];
  const seenEvidenceIds = new Set(
    preferenceEvidence.map(
      (evidence) => `${evidence.replyMemoryId}:${evidence.draftSendLogId}`,
    ),
  );
  for (const evidence of analyzedPreferenceEvidence) {
    const evidenceId = `${evidence.replyMemoryId}:${evidence.draftSendLogId}`;
    if (seenEvidenceIds.has(evidenceId)) continue;
    preferenceEvidence.push(evidence);
    seenEvidenceIds.add(evidenceId);
    if (
      preferenceEvidence.length >= MAX_PREFERENCE_EVIDENCE_FOR_LEARNED_STYLE
    ) {
      break;
    }
  }

  if (!preferenceEvidence.length) return;

  const learnedWritingStyle = await aiSummarizeLearnedWritingStyle({
    preferenceMemoryEvidence:
      formatPreferenceMemoryEvidence(preferenceEvidence),
    emailAccount,
  });

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { learnedWritingStyle },
  });

  const unanalyzedEvidencePredicates = preferenceEvidence
    .filter((evidence) => evidence.learnedWritingStyleAnalyzedAt === null)
    .map((evidence) => ({
      replyMemoryId: evidence.replyMemoryId,
      draftSendLogId: evidence.draftSendLogId,
    }));

  if (!unanalyzedEvidencePredicates.length) return;

  await prisma.replyMemorySource.updateMany({
    where: {
      learnedWritingStyleAnalyzedAt: null,
      OR: unanalyzedEvidencePredicates,
    },
    data: {
      learnedWritingStyleAnalyzedAt: new Date(),
    },
  });
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

async function markDraftSendLogReplyMemoryProcessed(
  id: string,
  options?: { keepSentText?: boolean },
) {
  await prisma.draftSendLog.update({
    where: { id },
    data: {
      replyMemoryProcessedAt: new Date(),
      ...(options?.keepSentText ? {} : { replyMemorySentText: null }),
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

const preferenceWritingEvidenceInclude = {
  replyMemory: {
    select: {
      content: true,
    },
  },
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
} satisfies Prisma.ReplyMemorySourceInclude;

type PreferenceWritingEvidencePayload = Prisma.ReplyMemorySourceGetPayload<{
  include: typeof preferenceWritingEvidenceInclude;
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
  memory: Pick<ReplyMemory, "scopeType" | "scopeValue">;
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

function formatPreferenceMemoryEvidence(
  preferenceEvidence: PreferenceWritingEvidencePayload[],
) {
  return preferenceEvidence
    .map((evidence, index) => {
      const draftText = evidence.draftSendLog.executedAction.content ?? "";
      const sentText = evidence.draftSendLog.replyMemorySentText ?? "";

      return `${index + 1}. ${evidence.replyMemory.content}
Draft example: ${truncatePreferenceEvidenceText(draftText) || "None"}
Sent example: ${truncatePreferenceEvidenceText(sentText) || "None"}`;
    })
    .join("\n\n");
}

function truncatePreferenceEvidenceText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 280
    ? `${normalized.slice(0, 277).trimEnd()}...`
    : normalized;
}
