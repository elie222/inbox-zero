import { getThreadsByJobId } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { CardTitle } from "@/components/ui/card";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getJobById, getLastJob } from "@/app/(app)/[account]/clean/helpers";
import { CleanRun } from "@/app/(app)/[account]/clean/CleanRun";

export default async function CleanRunPage(props: {
  searchParams: Promise<{ jobId: string; isPreviewBatch: string }>;
}) {
  const searchParams = await props.searchParams;

  const { jobId, isPreviewBatch } = searchParams;

  const session = await auth();
  if (!session?.user.email) return <div>Not authenticated</div>;

  const userEmail = session.user.email;

  const threads = await getThreadsByJobId({ emailAccountId: userEmail, jobId });

  const job = jobId
    ? await getJobById({ email: userEmail, jobId })
    : await getLastJob({ email: userEmail });

  if (!job) return <CardTitle>Job not found</CardTitle>;

  const [total, done] = await Promise.all([
    prisma.cleanupThread.count({ where: { jobId, emailAccountId: userEmail } }),
    prisma.cleanupThread.count({
      where: { jobId, emailAccountId: userEmail, archived: true },
    }),
  ]);

  return (
    <CleanRun
      isPreviewBatch={isPreviewBatch === "true"}
      job={job}
      threads={threads}
      total={total}
      done={done}
      userEmail={userEmail}
    />
  );
}
