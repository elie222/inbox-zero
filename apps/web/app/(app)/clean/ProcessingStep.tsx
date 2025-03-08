import { EmailFirehose } from "@/app/(app)/clean/EmailFirehose";
import { getThreads } from "@/utils/redis/clean";
import prisma from "@/utils/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export async function ProcessingStep({
  userId,
  jobId,
}: {
  userId: string;
  jobId: string;
}) {
  const threads = await getThreads(userId);

  const job = await prisma.cleanupJob.findUnique({
    where: { id: jobId, userId },
  });

  if (!job) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job not found</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <EmailFirehose threads={threads.filter((t) => t.status !== "processing")} />
  );
}
