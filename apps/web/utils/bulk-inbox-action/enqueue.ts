import type { BulkInboxActionProcessBody } from "@/app/api/bulk-inbox-action/process/validation";
import type { Logger } from "@/utils/logger";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";

const BULK_INBOX_ACTION_TOPIC = "bulk-inbox-action-process";

export async function enqueueBulkInboxActionChunk({
  jobId,
  chunkToken,
  logger,
}: {
  jobId: string;
  chunkToken: string;
  logger: Logger;
}) {
  await enqueueBackgroundJob<BulkInboxActionProcessBody>({
    topic: BULK_INBOX_ACTION_TOPIC,
    body: { jobId, chunkToken },
    qstash: {
      queueName: BULK_INBOX_ACTION_TOPIC,
      parallelism: 5,
      path: "/api/bulk-inbox-action/process",
      deduplicationId: `${jobId}-${chunkToken}`,
    },
    logger,
  });
}
