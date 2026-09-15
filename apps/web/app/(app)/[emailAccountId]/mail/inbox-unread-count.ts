import { GmailLabel } from "@/utils/gmail/label";
import { isThreadUnread } from "./read-state";
import { getListThreadKey, type ListThread } from "./types";

export function getInboxUnreadDelta({
  countByMessage,
  inboxFolderId,
  read,
  threadKeys,
  threads,
}: {
  countByMessage?: boolean;
  inboxFolderId?: string;
  read: boolean;
  threadKeys: string[];
  threads: ListThread[];
}) {
  const targets = new Set(threadKeys);
  let delta = 0;

  for (const thread of threads) {
    if (!targets.has(getListThreadKey(thread))) continue;
    if (countByMessage) {
      const affectedMessages = thread.messages.filter((message) => {
        const isInInbox =
          message.labelIds?.includes(GmailLabel.INBOX) ||
          (inboxFolderId && message.parentFolderId === inboxFolderId);
        const isUnread = message.labelIds?.includes(GmailLabel.UNREAD) ?? false;
        return isInInbox && isUnread !== !read;
      });
      delta += affectedMessages.length * (read ? -1 : 1);
      continue;
    }

    const isInInbox = thread.messages.some((message) =>
      message.labelIds?.includes(GmailLabel.INBOX),
    );
    if (!isInInbox) continue;

    const isUnread = isThreadUnread(thread.messages);
    if (isUnread === !read) continue;
    delta += read ? -1 : 1;
  }

  return delta;
}
