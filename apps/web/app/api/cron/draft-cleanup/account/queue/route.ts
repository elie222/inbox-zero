import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { draftCleanupAccountBody } from "../validation";

export const maxDuration = 300;

export const POST = createForwardingQueueHandler({
  loggerScope: "cron/draft-cleanup/account/queue",
  schema: draftCleanupAccountBody,
  path: "/api/cron/draft-cleanup/account",
  invalidPayloadMessage: "Invalid draft cleanup queue payload",
  visibilityTimeoutSeconds: 295,
  maxDeliveryAttempts: 3,
  getLoggerContext: (payload) => ({
    emailAccountId: payload.emailAccountId,
  }),
});
