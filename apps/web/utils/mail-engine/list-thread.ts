import type { ConversationSummary } from "@inboxzero/mail-core/queries";
import { GmailLabel } from "@/utils/gmail/label";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";

export function conversationSummaryToListThread(
  conversation: ConversationSummary,
): ListThread {
  const labelIds = [
    ...(conversation.unread ? [GmailLabel.UNREAD] : []),
    ...(conversation.starred ? [GmailLabel.STARRED] : []),
  ];
  const date = new Date(conversation.latestMessageAtMs).toISOString();
  return {
    id: conversation.key.conversationId,
    messageIds: [`${conversation.key.conversationId}:latest`],
    snippet: conversation.preview,
    plan: undefined,
    plans: [],
    participantMessages: undefined,
    messages: [
      {
        id: `${conversation.key.conversationId}:latest`,
        threadId: conversation.key.conversationId,
        snippet: conversation.preview,
        subject: conversation.subject,
        date,
        internalDate: String(conversation.latestMessageAtMs),
        labelIds,
        headers: {
          from: conversation.from,
          to: "",
          date,
          subject: conversation.subject,
        },
      },
    ],
  };
}
