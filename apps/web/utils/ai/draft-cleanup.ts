import type { ExecutedAction } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { isDraftUnmodified } from "@/utils/ai/choose-rule/draft-management";
import type { Logger } from "@/utils/logger";
import { DEFAULT_AI_DRAFT_CLEANUP_DAYS } from "@/utils/ai/draft-cleanup-settings";
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

  const staleActions = await prisma.executedAction.findMany({
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

  const staleTrackers = await prisma.threadTracker.findMany({
    where: {
      emailAccountId,
      followUpDraftId: { not: null },
      OR: [
        { followUpDraftCreatedAt: { lt: cutoffDate } },
        {
          followUpDraftCreatedAt: null,
          followUpAppliedAt: { lt: cutoffDate },
        },
      ],
    },
    select: {
      id: true,
      followUpDraftId: true,
      followUpDraftContent: true,
    },
    orderBy: { id: "asc" },
  });

  const staleDrafts: DraftCleanupCandidate[] = [
    ...staleActions.map((action) => ({ ...action, trackerId: null })),
    ...staleTrackers.map((tracker) => ({
      id: tracker.id,
      trackerId: tracker.id,
      draftId: tracker.followUpDraftId,
      content: tracker.followUpDraftContent,
      draftStatus: null,
      wasDraftSent: null,
    })),
  ];

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

      if (!draftDetails) {
        await recordDraftCleanup(
          action,
          DraftEmailStatus.MISSING_FROM_PROVIDER,
        );
        alreadyGone++;
        continue;
      }

      if (!draftDetails.textPlain && !draftDetails.textHtml) {
        skippedModified++;
        continue;
      }

      if (
        action.trackerId &&
        (draftDetails.hasAttachment || draftDetails.attachments?.length)
      ) {
        skippedModified++;
        continue;
      }

      const isUnmodified = action.content
        ? isDraftUnmodified({
            originalContent: action.content,
            currentDraft: draftDetails,
            logger,
            includeLinks: !!action.trackerId,
          })
        : false;

      if (!isUnmodified) {
        skippedModified++;
        continue;
      }

      const wasDeleted = await provider.deleteDraft(action.draftId);
      if (!wasDeleted) {
        errors++;
        continue;
      }
      await recordDraftCleanup(action, DraftEmailStatus.CLEANED_UP_UNUSED);
      deleted++;
    } catch (error) {
      logger.error("Error cleaning up draft", {
        trackedDraftId: action.id,
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

export async function cleanupConfiguredAIDrafts({
  logger,
}: {
  logger: Logger;
}) {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      draftCleanupDays: { not: null },
      account: { disconnectedAt: null },
      OR: [
        {
          executedRules: {
            some: {
              actionItems: {
                some: {
                  type: ActionType.DRAFT_EMAIL,
                  draftId: { not: null },
                  ...getDraftCleanupCandidateWhere(),
                },
              },
            },
          },
        },
        { threadTrackers: { some: { followUpDraftId: { not: null } } } },
      ],
    },
    select: {
      id: true,
      draftCleanupDays: true,
      account: { select: { provider: true } },
    },
  });

  let total = 0;
  let deleted = 0;
  let skippedModified = 0;
  let alreadyGone = 0;
  let errors = 0;
  let failedAccounts = 0;

  for (const emailAccount of emailAccounts) {
    if (emailAccount.draftCleanupDays === null) continue;

    try {
      const result = await cleanupAIDraftsForAccount({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
        cleanupDays: emailAccount.draftCleanupDays,
      });

      total += result.total;
      deleted += result.deleted;
      skippedModified += result.skippedModified;
      alreadyGone += result.alreadyGone;
      errors += result.errors;
    } catch (error) {
      logger.error("Error cleaning up drafts for account", {
        emailAccountId: emailAccount.id,
        error,
      });
      failedAccounts++;
      errors++;
    }
  }

  return {
    accountsChecked: emailAccounts.length,
    failedAccounts,
    total,
    deleted,
    skippedModified,
    alreadyGone,
    errors,
  };
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

type DraftCleanupCandidate = Pick<
  ExecutedAction,
  "id" | "draftId" | "content" | "draftStatus" | "wasDraftSent"
> & { trackerId: string | null };

async function recordDraftCleanup(
  draft: DraftCleanupCandidate,
  status: DraftEmailStatus,
) {
  if (draft.trackerId) {
    // Do not clear tracking for a replacement created during cleanup.
    await prisma.threadTracker.updateMany({
      where: { id: draft.trackerId, followUpDraftId: draft.draftId },
      data: {
        followUpDraftId: null,
        followUpDraftContent: null,
        followUpDraftCreatedAt: null,
      },
    });
    return;
  }

  const statusData = getDraftCleanupStatusData({
    draftStatus: draft.draftStatus,
    wasDraftSent: draft.wasDraftSent,
    status,
  });
  if (statusData) {
    await prisma.executedAction.update({
      where: { id: draft.id },
      data: statusData,
    });
  }
}
