import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { sendInboxHealthEmailBody } from "../validation";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "resend/inbox-health/queue",
  schema: sendInboxHealthEmailBody,
  path: "/api/resend/inbox-health",
  invalidPayloadMessage: "Invalid resend inbox health queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: (payload) => ({
    emailAccountId: payload.emailAccountId,
  }),
});
