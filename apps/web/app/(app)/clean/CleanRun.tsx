import { EmailFirehose } from "@/app/(app)/clean/EmailFirehose";
import { PreviewBatch } from "@/app/(app)/clean/PreviewBatch";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useJobStatus } from "@/app/(app)/clean/useJobStatus";
import type { getThreadsByJobId } from "@/utils/redis/clean";
import type { CleanupJob } from "@prisma/client";

export function CleanRun({
  isPreviewBatch,
  job,
  threads,
  userEmail,
}: {
  isPreviewBatch: boolean;
  job: CleanupJob;
  threads: Awaited<ReturnType<typeof getThreadsByJobId>>;
  userEmail: string;
}) {
  const { data } = useJobStatus(job.id);

  const progress = data ? data.progress : undefined;

  return (
    <div className="mx-auto my-4 w-full max-w-2xl px-4">
      {isPreviewBatch && <PreviewBatch job={job} />}
      <Card className="p-6">
        <EmailFirehose
          threads={threads.filter((t) => t.status !== "processing")}
          stats={{ total: data?.total || 0, done: data?.archived || 0 }}
          userEmail={userEmail}
          action={job.action}
        />
      </Card>
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          {/* <div className="text-sm text-muted-foreground">
            {jobStatus?.previewBatchDone
              ? "Preview batch completed"
              : "Processing preview batch..."}
          </div> */}
          <div className="text-sm text-muted-foreground">
            {data?.completed || 0} / {data?.total || 0} emails
          </div>
        </div>
        <Progress value={progress} className="h-2" />
      </Card>
    </div>
  );
}
