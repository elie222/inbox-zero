import { EmailFirehose } from "@/app/(app)/clean/EmailFirehose";
import { getThreadsByJobId } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { PreviewBatchCompleted } from "@/app/(app)/clean/PreviewBatchCompleted";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

export default async function CleanRunPage({
  searchParams: { jobId, isPreviewBatch },
}: {
  searchParams: { jobId: string; isPreviewBatch: string };
}) {
  const session = await auth();
  if (!session?.user.email) return <div>Not authenticated</div>;

  const userId = session.user.id;
  const userEmail = session.user.email;

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
    <div className="my-4 max-w-2xl sm:mx-4 md:mx-auto">
      {isPreviewBatch && (
        <PreviewBatchCompleted total={total} archived={archived} job={job} />
      )}
      <Card className="p-6">
        <EmailFirehose
          threads={threads.filter((t) => t.status !== "processing")}
          stats={{ total, archived }}
          userEmail={userEmail}
          action={job.action}
        />
      </Card>
    </div>
  );
}
