import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { bulkInboxActionProcessBody } from "../validation";

// Forwarding waits for the chunk, which runs for minutes.
export const maxDuration = 300;

export const POST = createForwardingQueueHandler({
  loggerScope: "bulk-inbox-action/process/queue",
  schema: bulkInboxActionProcessBody,
  path: "/api/bulk-inbox-action/process",
  invalidPayloadMessage: "Invalid bulk inbox action queue payload",
  visibilityTimeoutSeconds: 330,
  getLoggerContext: (payload) => ({ bulkInboxActionJobId: payload.jobId }),
});
