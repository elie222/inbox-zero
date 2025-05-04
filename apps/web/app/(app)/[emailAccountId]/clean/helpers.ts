import prisma from "utils/prisma";

export async function getJobById({
  emailAccountId,
  jobId,
}: {
  emailAccountId: string;
  jobId: string;
}) {
  return await prisma.cleanupJob.findUnique({
    where: { id: jobId, emailAccountId },
  });
}

export async function getLastJob({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return await prisma.cleanupJob.findFirst({
    where: { emailAccountId },
    orderBy: { createdAt: "desc" },
  });
}
