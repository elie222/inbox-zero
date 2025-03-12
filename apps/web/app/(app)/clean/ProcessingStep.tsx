import { EmailFirehose } from "@/app/(app)/clean/EmailFirehose";
import { getThreadsByJobId } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { CardTitle } from "@/components/ui/card";
import { PreviewBatchCompleted } from "@/app/(app)/clean/PreviewBatchCompleted";

export async function ProcessingStep({
  userId,
  jobId,
  userEmail,
  isPreviewBatch,
}: {
  userId: string;
  jobId: string;
  userEmail: string;
  isPreviewBatch?: string;
}) {
  const threads = await getThreadsByJobId(userId, jobId);

  if (!jobId) return <CardTitle>No job ID</CardTitle>;

  const job = await prisma.cleanupJob.findUnique({
    where: { id: jobId, userId },
  });

  if (!job) return <CardTitle>Job not found</CardTitle>;

  const [total, archived] = await Promise.all([
    prisma.cleanupThread.count({ where: { jobId, userId } }),
    prisma.cleanupThread.count({ where: { jobId, userId, archived: true } }),
  ]);

  return (
    <>
      {isPreviewBatch && (
        <PreviewBatchCompleted total={total} archived={archived} job={job} />
      )}
      <EmailFirehose
        threads={threads.filter((t) => t.status !== "processing")}
        stats={{ total, archived }}
        userEmail={userEmail}
        action={job.action}
      />
    </>
  );
}
