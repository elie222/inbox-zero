import prisma from "@/utils/prisma";

const DIGEST_SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getDigestSummaryWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - DIGEST_SUMMARY_WINDOW_MS);
}

export async function hasReachedDigestSummaryLimit({
  emailAccountId,
  maxSummariesPer24h,
  now = new Date(),
}: {
  emailAccountId: string;
  maxSummariesPer24h: number;
  now?: Date;
}): Promise<boolean> {
  if (maxSummariesPer24h <= 0) return false;

  const summariesInWindow = await prisma.digestItem.count({
    where: {
      digest: {
        emailAccountId,
      },
      createdAt: {
        gte: getDigestSummaryWindowStart(now),
      },
    },
  });

  return summariesInWindow >= maxSummariesPer24h;
}
