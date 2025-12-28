import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";
import { WrappedStatus } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import type { WrappedData } from "./types";
import { computeVolumeStats } from "./steps/volume";
import { computeActivityStats } from "./steps/activity";
import { computePeopleStats } from "./steps/people";
import { computeResponseTimeStats } from "./steps/response-time";
import { computeAIImpactStats } from "./steps/ai-impact";

const logger = createScopedLogger("wrapped");

export async function generateWrappedData(
  emailAccountId: string,
  year: number,
): Promise<WrappedData> {
  logger.info("Starting wrapped generation", { emailAccountId, year });

  // Update status to processing
  await prisma.emailWrapped.upsert({
    where: {
      emailAccountId_year: { emailAccountId, year },
    },
    create: {
      emailAccountId,
      year,
      status: WrappedStatus.PROCESSING,
    },
    update: {
      status: WrappedStatus.PROCESSING,
      data: Prisma.DbNull,
    },
  });

  try {
    // Compute all stats in parallel where possible
    const [volume, activity, people, responseTime, aiImpact] =
      await Promise.all([
        computeVolumeStats(emailAccountId, year),
        computeActivityStats(emailAccountId, year),
        computePeopleStats(emailAccountId, year),
        computeResponseTimeStats(emailAccountId, year),
        computeAIImpactStats(emailAccountId, year),
      ]);

    const wrappedData: WrappedData = {
      year,
      volume,
      activity,
      people,
      responseTime,
      aiImpact,
      generatedAt: new Date().toISOString(),
    };

    // Save to database
    await prisma.emailWrapped.update({
      where: {
        emailAccountId_year: { emailAccountId, year },
      },
      data: {
        status: WrappedStatus.COMPLETE,
        data: wrappedData,
      },
    });

    logger.info("Wrapped generation complete", { emailAccountId, year });
    return wrappedData;
  } catch (error) {
    logger.error("Wrapped generation failed", {
      emailAccountId,
      year,
      error,
    });

    // Update status to error
    await prisma.emailWrapped.update({
      where: {
        emailAccountId_year: { emailAccountId, year },
      },
      data: {
        status: WrappedStatus.ERROR,
      },
    });

    throw error;
  }
}
