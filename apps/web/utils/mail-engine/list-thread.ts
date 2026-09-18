import type { ConversationSummary } from "@inboxzero/mail-core/queries";
import type {
  MailboxRole,
  MessageMetadata,
} from "@inboxzero/mail-core/messages";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { CombinedListThread } from "@/utils/threads/load-combined";

const ROLE_LABEL: Record<MailboxRole, string> = {
  inbox: "INBOX",
  sent: "SENT",
  draft: "DRAFT",
  trash: "TRASH",
  spam: "SPAM",
};

export function conversationSummaryToListThread(
  conversation: ConversationSummary,
  account?: CombinedListThread["account"],
): ListThread {
  const date = new Date(conversation.latestMessageAtMs).toISOString();
  const labelIds = conversationLabelIds(conversation);
  const messageId = `${conversation.key.conversationId}:latest`;
  const thread = {
    id: conversation.key.conversationId,
    messageIds: [messageId],
    snippet: conversation.preview,
    plan: undefined,
    plans: [],
    participantMessages: undefined,
    messages: [
      {
        id: messageId,
        threadId: conversation.key.conversationId,
        snippet: conversation.preview,
        subject: conversation.subject,
        date,
        internalDate: String(conversation.latestMessageAtMs),
        labelIds,
        parentFolderId: undefined,
        headers: {
          from: conversation.from,
          to: conversation.to,
          date,
          subject: conversation.subject,
        },
      },
    ],
  };
  return account ? { ...thread, account } : thread;
}

export function conversationLabelIds(conversation: ConversationSummary) {
  return messageLabelIds({
    labelIds: conversation.labelIds,
    read: !conversation.unread,
    roles: conversation.roles,
    starred: conversation.starred,
  });
}

export function messageLabelIds(
  metadata: Pick<MessageMetadata, "labelIds" | "read" | "roles" | "starred">,
) {
  return [
    ...metadata.roles.map((role) => ROLE_LABEL[role]),
    ...(!metadata.read ? ["UNREAD"] : []),
    ...(metadata.starred ? ["STARRED"] : []),
    ...metadata.labelIds,
  ];
}
