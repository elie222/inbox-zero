import { z } from "zod";

export const executeMessagingNotificationBody = z.object({
  notificationId: z.string().min(1),
});

export type ExecuteMessagingNotificationBody = z.infer<
  typeof executeMessagingNotificationBody
>;
