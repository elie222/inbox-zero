import { z } from "zod";
import { LINKABLE_MESSAGING_PROVIDERS } from "@/utils/messaging/chat-sdk/link-code";

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

export const linkSlackWorkspaceBody = z.object({
  teamId: z.string().min(1),
});

export const createMessagingLinkCodeBody = z.object({
  provider: z.enum(LINKABLE_MESSAGING_PROVIDERS),
});

export const messagingActionTypeEnum = z.enum([
  "NOTIFY_MESSAGING_CHANNEL",
  "DRAFT_MESSAGING_CHANNEL",
]);

export type MessagingActionType = z.infer<typeof messagingActionTypeEnum>;

export const toggleRuleChannelBody = z.object({
  ruleId: z.string().min(1),
  messagingChannelId: z.string().min(1),
  enabled: z.boolean(),
  actionType: messagingActionTypeEnum.optional(),
});
