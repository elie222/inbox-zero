import { z } from "zod";
import { LINKABLE_MESSAGING_PROVIDERS } from "@/utils/messaging/chat-sdk/link-code";

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

export const linkSlackWorkspaceBody = z.object({
  teamId: z.string().min(1),
});

export const createMessagingLinkCodeBody = z.object({
  provider: z.enum(LINKABLE_MESSAGING_PROVIDERS),
});
