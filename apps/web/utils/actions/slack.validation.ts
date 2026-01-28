import { z } from "zod";

export const updateSlackChannelBody = z.object({
  connectionId: z.string().min(1),
  channelId: z.string().min(1),
  channelName: z.string().min(1),
});

export type UpdateSlackChannelBody = z.infer<typeof updateSlackChannelBody>;

export const updateMeetingBriefsDeliveryBody = z.object({
  sendEmail: z.boolean(),
  sendSlack: z.boolean(),
});

export type UpdateMeetingBriefsDeliveryBody = z.infer<
  typeof updateMeetingBriefsDeliveryBody
>;

export const disconnectSlackBody = z.object({
  connectionId: z.string().min(1),
});

export type DisconnectSlackBody = z.infer<typeof disconnectSlackBody>;
