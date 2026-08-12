import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import { GmailLabel } from "@/utils/gmail/label";

/**
 * A thread is unread when its latest message is. The row's styling, the reader's
 * ⋯ menu and the update below all have to agree on that, so they read it here.
 * Both providers normalise to these ids, so this is not a provider branch.
 */
export function isThreadUnread(
  messages: readonly { labelIds?: string[] | null }[],
) {
  return messages.at(-1)?.labelIds?.includes(GmailLabel.UNREAD) ?? false;
}

/** Read state lives on every message, so marking a thread rewrites all of them. */
export function withThreadReadState(
  thread: ListThread,
  read: boolean,
): ListThread {
  return {
    ...thread,
    messages: thread.messages.map((message) => {
      const labelIds = message.labelIds ?? [];
      const isRead = !labelIds.includes(GmailLabel.UNREAD);
      if (isRead === read) return message;

      return {
        ...message,
        labelIds: read
          ? labelIds.filter((labelId) => labelId !== GmailLabel.UNREAD)
          : [...labelIds, GmailLabel.UNREAD],
      };
    }),
  };
}
