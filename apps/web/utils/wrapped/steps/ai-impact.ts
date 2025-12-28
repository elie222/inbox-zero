import prisma from "@/utils/prisma";
import { ActionType, NewsletterStatus } from "@/generated/prisma/enums";
import type { AIImpactStats } from "../types";
import { SECONDS_PER_ARCHIVE, SECONDS_PER_LABEL } from "../types";

export async function computeAIImpactStats(
  emailAccountId: string,
  year: number,
): Promise<AIImpactStats> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const [unsubscribes, autoArchived, autoLabeled] = await Promise.all([
    // Count unsubscribes
    prisma.newsletter.count({
      where: {
        emailAccountId,
        status: NewsletterStatus.UNSUBSCRIBED,
        updatedAt: { gte: startDate, lt: endDate },
      },
    }),

    // Count auto-archived emails
    prisma.executedAction.count({
      where: {
        type: ActionType.ARCHIVE,
        createdAt: { gte: startDate, lt: endDate },
        executedRule: {
          emailAccountId,
        },
      },
    }),

    // Count auto-labeled emails
    prisma.executedAction.count({
      where: {
        type: ActionType.LABEL,
        createdAt: { gte: startDate, lt: endDate },
        executedRule: {
          emailAccountId,
        },
      },
    }),
  ]);

  // Calculate hours saved
  const totalSecondsSaved =
    autoArchived * SECONDS_PER_ARCHIVE + autoLabeled * SECONDS_PER_LABEL;
  const hoursSaved = Math.round(totalSecondsSaved / 3600);

  return {
    unsubscribes,
    autoArchived,
    autoLabeled,
    hoursSaved,
  };
}
