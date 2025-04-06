import { getThreadsByJobId } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { CardTitle } from "@/components/ui/card";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getJobById, getLastJob } from "@/app/(app)/clean/helpers";
import { CleanRun } from "@/app/(app)/clean/CleanRun";

export default async function CleanRunPage(props: {
  searchParams: Promise<{ jobId: string; isPreviewBatch: string }>;
}) {
  const searchParams = await props.searchParams;

  const { jobId, isPreviewBatch } = searchParams;

  const session = await auth();
  if (!session?.user.email) return <div>Not authenticated</div>;

  const userId = session.user.id;
  const userEmail = session.user.email;

  const threads = await getThreadsByJobId(userId, jobId);

  const job = jobId
    ? await getJobById({ userId, jobId })
    : await getLastJob(userId);

  if (!job) return <CardTitle>Job not found</CardTitle>;

  const [total, done] = await Promise.all([
    prisma.cleanupThread.count({ where: { jobId, userId } }),
    prisma.cleanupThread.count({ where: { jobId, userId, archived: true } }),
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
