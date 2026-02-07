import { z } from "zod";

export const updateChannelTargetBody = z.object({
  channelId: z.string().min(1),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
});

export type UpdateChannelTargetBody = z.infer<typeof updateChannelTargetBody>;

export const updateChannelFeaturesBody = z.object({
  channelId: z.string().min(1),
  sendMeetingBriefs: z.boolean(),
});

export type UpdateChannelFeaturesBody = z.infer<
  typeof updateChannelFeaturesBody
>;

export const updateEmailDeliveryBody = z.object({
  sendEmail: z.boolean(),
});

export type UpdateEmailDeliveryBody = z.infer<typeof updateEmailDeliveryBody>;

export const disconnectChannelBody = z.object({
  channelId: z.string().min(1),
});

export type DisconnectChannelBody = z.infer<typeof disconnectChannelBody>;
