import type { MessagingProvider } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export type FollowUpNotificationReplyContext = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
};

/**
 * Resolves the email a messaging reply refers to when the user replies to a
 * follow-up notification (Slack thread reply / Telegram reply_to_message).
 *
 * Matches against the delivery records persisted on
 * `ThreadTracker.followUpNotifications` when the notification was sent. The
 * lookup is scoped to the email accounts linked to the chat user so a reply
 * can never resolve to another user's tracker.
 */
export async function getFollowUpNotificationReplyContext({
  provider,
  providerThreadId,
  providerMessageId,
  emailAccountIds,
}: {
  provider: MessagingProvider;
  providerThreadId: string;
  providerMessageId: string;
  emailAccountIds: string[];
}): Promise<FollowUpNotificationReplyContext | null> {
  if (emailAccountIds.length === 0) return null;

  const tracker = await prisma.threadTracker.findFirst({
    where: {
      emailAccountId: { in: emailAccountIds },
      followUpNotifications: {
        array_contains: [{ provider, providerThreadId, providerMessageId }],
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      emailAccountId: true,
      threadId: true,
      messageId: true,
    },
  });

  if (!tracker) return null;

  return {
    emailAccountId: tracker.emailAccountId,
    threadId: tracker.threadId,
    messageId: tracker.messageId,
  };
}
