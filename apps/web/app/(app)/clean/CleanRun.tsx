import { EmailFirehose } from "@/app/(app)/clean/EmailFirehose";
import { PreviewBatch } from "@/app/(app)/clean/PreviewBatch";
import { Card } from "@/components/ui/card";
import type { getThreadsByJobId } from "@/utils/redis/clean";
import type { CleanupJob } from "@prisma/client";

export function CleanRun({
  isPreviewBatch,
  job,
  threads,
  total,
  done,
  userEmail,
}: {
  isPreviewBatch: boolean;
  job: CleanupJob;
  threads: Awaited<ReturnType<typeof getThreadsByJobId>>;
  total: number;
  done: number;
  userEmail: string;
}) {
  return (
    <div className="mx-auto my-4 w-full max-w-2xl px-4">
      {isPreviewBatch && <PreviewBatch job={job} />}
      <Card className="p-6">
        <EmailFirehose
          threads={threads.filter((t) => t.status !== "processing")}
          stats={{ total, done }}
          userEmail={userEmail}
          action={job.action}
        />
      </Card>
    </div>
  );
}
