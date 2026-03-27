import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { executeMessagingNotificationBody } from "@/utils/messaging-notifications/validation";
import { executeMessagingNotification } from "@/utils/messaging-notifications/execute";

export const maxDuration = 300;

export const POST = withError(
  "messaging-notifications/execute",
  withQstashOrInternal(async (request) => {
    const logger = request.logger;
    const validation = executeMessagingNotificationBody.safeParse(
      await request.json(),
    );

    if (!validation.success) {
      logger.error("Invalid messaging notification execute payload", {
        errors: validation.error.errors,
      });
      return new Response("Invalid payload", { status: 400 });
    }

    return executeMessagingNotification({
      notificationId: validation.data.notificationId,
      logger,
    });
  }),
);
