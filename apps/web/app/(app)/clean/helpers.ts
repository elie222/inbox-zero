import prisma from "utils/prisma";

export async function getJobById({
  userId,
  jobId,
}: {
  userId: string;
  jobId: string;
}) {
  return await prisma.cleanupJob.findUnique({
    where: { id: jobId, userId },
  });
}

export async function getLastJob(userId: string) {
  return await prisma.cleanupJob.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
