import { z } from "zod";

export const updateSlackChannelBody = z.object({
  channelId: z.string().min(1),
  targetId: z.string().min(1),
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

export const connectWhatsAppBody = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  authorizedSender: z.string().min(1),
  displayName: z.string().trim().optional(),
});
export type ConnectWhatsAppBody = z.infer<typeof connectWhatsAppBody>;
