import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { withError } from "@/utils/middleware";
import { handleBatchRequest } from "@/app/api/user/categorize/senders/batch/handle-batch";

export const maxDuration = 300;

export const POST = verifySignatureAppRouter(
  withError("user/categorize/senders/batch", handleBatchRequest),
);
