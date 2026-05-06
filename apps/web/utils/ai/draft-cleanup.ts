import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { isDraftUnmodified } from "@/utils/ai/choose-rule/draft-management";
import type { Logger } from "@/utils/logger";

export type AiDraftCleanupTrigger = "scheduled" | "manual";

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

export async function cleanupAIDraftsForAccount({
  emailAccountId,
  provider: providerName,
  logger,
  trigger = "manual",
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
  trigger?: AiDraftCleanupTrigger;
}) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      aiDraftAutoCleanupEnabled: true,
      aiDraftRetentionDays: true,
    },
  });

  if (!account) {
    logger.warn("Email account not found for AI draft cleanup", {
      emailAccountId,
    });
    return {
      total: 0,
      deleted: 0,
      skippedModified: 0,
      alreadyGone: 0,
      errors: 0,
    };
  }

  if (trigger === "scheduled" && !account.aiDraftAutoCleanupEnabled) {
    return {
      total: 0,
      deleted: 0,
      skippedModified: 0,
      alreadyGone: 0,
      errors: 0,
    };
  }

  const staleDays = clampRetentionDays(account.aiDraftRetentionDays);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - staleDays);

  const staleDrafts = await prisma.executedAction.findMany({
    where: {
      executedRule: { emailAccountId },
      type: ActionType.DRAFT_EMAIL,
      draftId: { not: null },
      OR: [{ draftSendLog: null }, { wasDraftSent: false }],
      createdAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      draftId: true,
      content: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (staleDrafts.length === 0) {
    return {
      total: 0,
      deleted: 0,
      skippedModified: 0,
      alreadyGone: 0,
      errors: 0,
    };
  }

  const provider = await createEmailProvider({
    emailAccountId,
    provider: providerName,
    logger,
  });

  let deleted = 0;
  let skippedModified = 0;
  let alreadyGone = 0;
  let errors = 0;

  for (const action of staleDrafts) {
    if (!action.draftId) continue;

    try {
      const draftDetails = await provider.getDraft(action.draftId);

      if (!draftDetails?.textPlain && !draftDetails?.textHtml) {
        await prisma.executedAction.update({
          where: { id: action.id },
          data: { wasDraftSent: false },
        });
        alreadyGone++;
        continue;
      }

      const isUnmodified = action.content
        ? isDraftUnmodified({
            originalContent: action.content,
            currentDraft: draftDetails,
            logger,
          })
        : false;

      if (!isUnmodified) {
        skippedModified++;
        continue;
      }

      await provider.deleteDraft(action.draftId);
      await prisma.executedAction.update({
        where: { id: action.id },
        data: { wasDraftSent: false },
      });
      deleted++;
    } catch (error) {
      logger.error("Error cleaning up draft", {
        executedActionId: action.id,
        draftId: action.draftId,
        error,
      });
      errors++;
    }
  }

  logger.info("AI draft cleanup completed", {
    total: staleDrafts.length,
    deleted,
    skippedModified,
    alreadyGone,
    errors,
  });

  return {
    total: staleDrafts.length,
    deleted,
    skippedModified,
    alreadyGone,
    errors,
  };
}

function clampRetentionDays(days: number): number {
  if (!Number.isFinite(days)) return 14;
  return Math.min(
    MAX_RETENTION_DAYS,
    Math.max(MIN_RETENTION_DAYS, Math.floor(days)),
  );
}
