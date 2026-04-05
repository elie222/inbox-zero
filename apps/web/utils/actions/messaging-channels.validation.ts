import { z } from "zod";
import { LINKABLE_MESSAGING_PROVIDERS } from "@/utils/messaging/chat-sdk/link-code";
import { MessagingRoutePurpose } from "@/generated/prisma/enums";

export const updateSlackRouteBody = z.object({
  channelId: z.string().min(1),
  purpose: z.enum([
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
    MessagingRoutePurpose.MEETING_BRIEFS,
    MessagingRoutePurpose.DOCUMENT_FILINGS,
  ]),
  targetId: z.string().min(1),
});

export const updateMessagingFeatureRouteBody = z.object({
  channelId: z.string().min(1),
  purpose: z.enum([
    MessagingRoutePurpose.MEETING_BRIEFS,
    MessagingRoutePurpose.DOCUMENT_FILINGS,
  ]),
  enabled: z.boolean(),
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
