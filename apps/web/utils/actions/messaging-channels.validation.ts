import { z } from "zod";

export const updateSlackChannelBody = z.object({
  channelId: z.string().min(1),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
});

export const updateChannelFeaturesBody = z.object({
  channelId: z.string().min(1),
  sendMeetingBriefs: z.boolean().optional(),
  sendDocumentFilings: z.boolean().optional(),
});

export const updateEmailDeliveryBody = z.object({
  sendEmail: z.boolean(),
});

export const disconnectChannelBody = z.object({
  channelId: z.string().min(1),
});
