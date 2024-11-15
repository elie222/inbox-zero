import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { withError } from "@/utils/middleware";
import { handleBatch } from "@/app/api/user/categorize/senders/batch/handle-batch";

export const POST = withError(verifySignatureAppRouter(handleBatch));
