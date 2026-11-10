import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { bulkInboxActionProcessBody } from "../validation";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "bulk-inbox-action/process/queue",
  schema: bulkInboxActionProcessBody,
  path: "/api/bulk-inbox-action/process",
  invalidPayloadMessage: "Invalid bulk inbox action queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: (payload) => ({ bulkInboxActionJobId: payload.jobId }),
});
