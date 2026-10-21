import prisma from "@/utils/prisma";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { classifyEmailAccountProviderIssue } from "@/utils/email/provider-health";
import { isDraftUnmodified } from "@/utils/ai/choose-rule/draft-management";
import type { Logger } from "@/utils/logger";
import { subDays } from "date-fns/subDays";
import {
  DEFAULT_AI_DRAFT_CLEANUP_DAYS,
  MIN_AI_DRAFT_CLEANUP_DAYS,
} from "@/utils/ai/draft-cleanup-settings";
import { withPrismaRetry } from "@/utils/prisma-retry";

export async function cleanupAIDraftsForAccount({
  emailAccountId,
  provider: providerName,
  logger,
  cleanupDays,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
  cleanupDays: number;
}) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - cleanupDays);

  const staleDrafts = await prisma.executedAction.findMany({
    where: {
      executedRule: { emailAccountId },
      type: ActionType.DRAFT_EMAIL,
      draftId: { not: null },
      ...getDraftCleanupCandidateWhere(),
      createdAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      draftId: true,
      draftStatus: true,
      wasDraftSent: true,
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
      cleanupDays,
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
        const statusData = getDraftCleanupStatusData({
          draftStatus: action.draftStatus,
          wasDraftSent: action.wasDraftSent,
          status: DraftEmailStatus.MISSING_FROM_PROVIDER,
        });
        if (statusData) {
          await prisma.executedAction.update({
            where: { id: action.id },
            data: statusData,
          });
        }
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
        // Without the original content we can't tell, so it stays a candidate.
        if (action.content) {
          const statusData = getDraftCleanupStatusData({
            draftStatus: action.draftStatus,
            wasDraftSent: action.wasDraftSent,
            status: DraftEmailStatus.USER_EDITED,
          });
          if (statusData) {
            await prisma.executedAction.update({
              where: { id: action.id },
              data: statusData,
            });
          }
        }
        skippedModified++;
        continue;
      }

      await provider.deleteDraft(action.draftId);
      const statusData = getDraftCleanupStatusData({
        draftStatus: action.draftStatus,
        wasDraftSent: action.wasDraftSent,
        status: DraftEmailStatus.CLEANED_UP_UNUSED,
      });
      if (statusData) {
        await prisma.executedAction.update({
          where: { id: action.id },
          data: statusData,
        });
      }
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
    cleanupDays,
  };
}

export async function markTrackedDraftDeleted({
  draftId,
  emailAccountId,
  logger,
}: {
  draftId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const trackedDraft = await withPrismaRetry(
    () =>
      prisma.executedAction.findFirst({
        where: {
          draftId,
          executedRule: { emailAccountId },
          type: ActionType.DRAFT_EMAIL,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, draftStatus: true, wasDraftSent: true },
      }),
    { logger },
  );
  if (!trackedDraft) return;

  const statusData = getDraftCleanupStatusData({
    draftStatus: trackedDraft.draftStatus,
    wasDraftSent: trackedDraft.wasDraftSent,
    status: DraftEmailStatus.CLEANED_UP_UNUSED,
  });
  if (statusData) {
    await withPrismaRetry(
      () =>
        prisma.executedAction.update({
          where: { id: trackedDraft.id },
          data: statusData,
        }),
      { logger },
    );
  }
}

export async function getEmailAccountsWithStaleAIDrafts() {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      draftCleanupDays: { not: null },
      account: { disconnectedAt: null },
      executedRules: {
        some: {
          actionItems: {
            some: {
              type: ActionType.DRAFT_EMAIL,
              draftId: { not: null },
              ...getDraftCleanupCandidateWhere(),
              createdAt: { lt: subDays(new Date(), MIN_AI_DRAFT_CLEANUP_DAYS) },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return emailAccounts.map((emailAccount) => emailAccount.id);
}

export async function cleanupConfiguredAIDraftsForAccount({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      draftCleanupDays: true,
      account: { select: { provider: true, disconnectedAt: true } },
    },
  });

  if (
    emailAccount?.draftCleanupDays == null ||
    emailAccount.account.disconnectedAt
  ) {
    logger.info("Skipping draft cleanup: cleanup disabled or disconnected");
    return null;
  }

  try {
    return await cleanupAIDraftsForAccount({
      emailAccountId,
      provider: emailAccount.account.provider,
      logger,
      cleanupDays: emailAccount.draftCleanupDays,
    });
  } catch (error) {
    if (
      classifyEmailAccountProviderIssue({
        error,
        provider: emailAccount.account.provider as "google" | "microsoft",
      })
    ) {
      logger.warn("Skipping draft cleanup: account needs reconnect", {
        error,
      });
      return null;
    }
    throw error;
  }
}

export async function getConfiguredDraftCleanupDays(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { draftCleanupDays: true },
  });

  return emailAccount?.draftCleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS;
}

function getDraftCleanupStatusData({
  draftStatus,
  wasDraftSent,
  status,
}: {
  draftStatus?: DraftEmailStatus | null;
  wasDraftSent?: boolean | null;
  status: DraftEmailStatus;
}): { draftStatus?: DraftEmailStatus; wasDraftSent?: null } | null {
  const data: { draftStatus?: DraftEmailStatus; wasDraftSent?: null } = {};

  if (canTransitionDraftStatus(draftStatus) && draftStatus !== status) {
    data.draftStatus = status;
  }
  if (wasDraftSent === false) {
    data.wasDraftSent = null;
  }

  return Object.keys(data).length > 0 ? data : null;
}

function canTransitionDraftStatus(
  current: DraftEmailStatus | null | undefined,
) {
  return (
    !current ||
    current === DraftEmailStatus.PENDING ||
    current === DraftEmailStatus.REPLIED_WITHOUT_DRAFT
  );
}

function getDraftCleanupCandidateWhere() {
  return {
    OR: [
      {
        draftStatus: {
          in: [
            DraftEmailStatus.PENDING,
            DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
          ],
        },
      },
      { draftStatus: null },
      // Legacy rows with wasDraftSent=false were migrated to CLEANED_UP_UNUSED,
      // even when the provider draft still needed a retry.
      {
        draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
        wasDraftSent: false,
      },
    ],
  };
}
