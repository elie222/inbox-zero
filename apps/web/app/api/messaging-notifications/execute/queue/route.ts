import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { executeMessagingNotificationBody } from "@/utils/messaging-notifications/validation";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "messaging-notifications/queue",
  schema: executeMessagingNotificationBody,
  path: "/api/messaging-notifications/execute",
  invalidPayloadMessage: "Invalid messaging notification queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: (payload) => ({
    notificationId: payload.notificationId,
  }),
});
