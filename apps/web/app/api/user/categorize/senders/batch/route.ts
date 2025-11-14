import { verifyQueueSignatureAppRouter } from "@/utils/queue-signature";
import { withError } from "@/utils/middleware";
import { handleBatchRequest } from "@/app/api/user/categorize/senders/batch/handle-batch";

export const maxDuration = 300;

export const POST = withError(
  verifyQueueSignatureAppRouter(handleBatchRequest),
);
