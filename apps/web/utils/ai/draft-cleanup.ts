import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { calculateSimilarity } from "@/utils/similarity-score";
import type { Logger } from "@/utils/logger";

const STALE_DAYS = 3;

export async function cleanupAIDraftsForAccount({
  emailAccountId,
  provider: providerName,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS);

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
    return { total: 0, deleted: 0, skippedModified: 0, alreadyGone: 0, errors: 0 };
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

      const similarityScore = calculateSimilarity(
        action.content,
        draftDetails,
      );

      if (similarityScore !== 1.0) {
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

  return { total: staleDrafts.length, deleted, skippedModified, alreadyGone, errors };
}
