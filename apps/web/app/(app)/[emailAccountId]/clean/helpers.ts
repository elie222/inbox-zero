import prisma from "utils/prisma";

export async function getJobById({
  email,
  jobId,
}: {
  email: string;
  jobId: string;
}) {
  return await prisma.cleanupJob.findUnique({
    where: { id: jobId, email },
  });
}

export async function getLastJob({ accountId }: { accountId: string }) {
  return await prisma.cleanupJob.findFirst({
    where: { emailAccount: { accountId } },
    orderBy: { createdAt: "desc" },
  });
}
