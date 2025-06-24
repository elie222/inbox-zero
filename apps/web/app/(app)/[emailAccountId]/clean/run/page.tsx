import { getThreadsByJobId } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { CardTitle } from "@/components/ui/card";
import {
  getJobById,
  getLastJob,
} from "@/app/(app)/[emailAccountId]/clean/helpers";
import { CleanRun } from "@/app/(app)/[emailAccountId]/clean/CleanRun";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export default async function CleanRunPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ jobId: string; isPreviewBatch: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const searchParams = await props.searchParams;

  const { jobId, isPreviewBatch } = searchParams;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { email: true },
  });

  if (!emailAccount) return <CardTitle>Email account not found</CardTitle>;

  const email = emailAccount.email;

  const threads = await getThreadsByJobId({ emailAccountId, jobId });

  const job = jobId
    ? await getJobById({ emailAccountId, jobId })
    : await getLastJob({ emailAccountId });

  if (!job) return <CardTitle>Job not found</CardTitle>;

  const [total, done] = await Promise.all([
    prisma.cleanupThread.count({
      where: { jobId, emailAccountId },
    }),
    prisma.cleanupThread.count({
      where: { jobId, emailAccountId, archived: true },
    }),
  ]);

  return (
    <CleanRun
      isPreviewBatch={isPreviewBatch === "true"}
      job={job}
      threads={threads}
      total={total}
      done={done}
    />
  );
}
