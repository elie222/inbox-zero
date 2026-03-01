import { z } from "zod";

export const updateMessagingChannelBody = z.object({
  channelId: z.string().min(1),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
});

// Backward-compatible alias while call sites migrate.
export const updateSlackChannelBody = updateMessagingChannelBody;

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

export const linkSlackWorkspaceBody = z.object({
  teamId: z.string().min(1),
});
