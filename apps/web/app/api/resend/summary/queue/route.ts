import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { sendSummaryEmailBody } from "../validation";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "resend/summary/queue",
  schema: sendSummaryEmailBody,
  path: "/api/resend/summary",
  invalidPayloadMessage: "Invalid resend summary queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: (payload) => ({
    emailAccountId: payload.emailAccountId,
  }),
});
