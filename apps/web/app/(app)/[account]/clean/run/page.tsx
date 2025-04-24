import { getThreadsByJobId } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { CardTitle } from "@/components/ui/card";
import { getJobById, getLastJob } from "@/app/(app)/[account]/clean/helpers";
import { CleanRun } from "@/app/(app)/[account]/clean/CleanRun";

export default async function CleanRunPage(props: {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ jobId: string; isPreviewBatch: string }>;
}) {
  const params = await props.params;
  const accountId = params.account;

  const searchParams = await props.searchParams;

  const { jobId, isPreviewBatch } = searchParams;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { accountId },
    select: { email: true },
  });

  if (!emailAccount) return <CardTitle>Email account not found</CardTitle>;

  const email = emailAccount.email;

  const threads = await getThreadsByJobId({ emailAccountId: email, jobId });

  const job = jobId
    ? await getJobById({ email, jobId })
    : await getLastJob({ email });

  if (!job) return <CardTitle>Job not found</CardTitle>;

  const [total, done] = await Promise.all([
    prisma.cleanupThread.count({
      where: { jobId, emailAccountId: email },
    }),
    prisma.cleanupThread.count({
      where: { jobId, emailAccountId: email, archived: true },
    }),
  ]);

  return (
    <CleanRun
      isPreviewBatch={isPreviewBatch === "true"}
      job={job}
      threads={threads}
      total={total}
      done={done}
      userEmail={email}
    />
  );
}
