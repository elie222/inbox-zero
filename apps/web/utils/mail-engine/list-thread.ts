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
  const senders =
    conversation.senders.length > 0
      ? conversation.senders
      : [conversation.from];
  const messages = senders.map((from, index) => ({
    id: `${conversation.key.conversationId}:p:${index}`,
    threadId: conversation.key.conversationId,
    snippet: conversation.preview,
    subject: conversation.subject,
    date,
    internalDate: String(conversation.latestMessageAtMs),
    labelIds,
    parentFolderId: undefined,
    headers: {
      from,
      to: conversation.to,
      date,
      subject: conversation.subject,
    },
  }));
  const thread = {
    id: conversation.key.conversationId,
    messageIds: messages.map((message) => message.id),
    snippet: conversation.preview,
    plan: undefined,
    plans: [],
    participantMessages: undefined,
    messages,
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
