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

export async function getLastJob({ email }: { email: string }) {
  return await prisma.cleanupJob.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });
}
