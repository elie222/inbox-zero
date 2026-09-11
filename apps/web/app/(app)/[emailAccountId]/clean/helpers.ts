import prisma from "@/utils/prisma";

export async function getJobById({
  emailAccountId,
  jobId,
}: {
  emailAccountId: string;
  jobId: string;
}) {
  return await prisma.cleanupJob.findUnique({
    where: { emailAccountId, id: jobId },
  });
}

export async function getLastJob({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return await prisma.cleanupJob.findFirst({
    orderBy: { createdAt: "desc" },
    where: { emailAccountId },
  });
}
