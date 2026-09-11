import { z } from "zod";
import { MessagingProvider } from "@/generated/prisma/enums";

export const followUpNotificationDeliverySchema = z.object({
  messagingChannelId: z.string(),
  provider: z.nativeEnum(MessagingProvider),
  providerThreadId: z.string(),
  providerMessageId: z.string(),
});

export type FollowUpNotificationDelivery = z.infer<
  typeof followUpNotificationDeliverySchema
>;

export const followUpNotificationDeliveriesSchema =
  followUpNotificationDeliverySchema.array();

export function parseFollowUpNotificationDeliveries(
  value: unknown,
): FollowUpNotificationDelivery[] {
  const parsed = followUpNotificationDeliveriesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
