import { z } from "zod";
import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";

export const maxDuration = 300;

const payloadSchema = z.object({
  automationJobRunId: z.string().min(1, "Automation job run ID is required"),
});

export const POST = createForwardingQueueHandler({
  loggerScope: "automation-jobs/execute/queue",
  schema: payloadSchema,
  path: "/api/automation-jobs/execute",
  invalidPayloadMessage: "Invalid automation jobs queue payload",
  visibilityTimeoutSeconds: 290,
  getLoggerContext: (payload) => ({
    automationJobRunId: payload.automationJobRunId,
  }),
});
