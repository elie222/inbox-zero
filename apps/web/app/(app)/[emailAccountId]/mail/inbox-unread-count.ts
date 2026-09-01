import { GmailLabel } from "@/utils/gmail/label";
import { isThreadUnread } from "./read-state";
import { getListThreadKey, type ListThread } from "./types";

export function getInboxUnreadDelta({
  inboxFolderId,
  read,
  threadKeys,
  threads,
}: {
  inboxFolderId?: string;
  read: boolean;
  threadKeys: string[];
  threads: ListThread[];
}) {
  const targets = new Set(threadKeys);
  let delta = 0;

  for (const thread of threads) {
    if (!targets.has(getListThreadKey(thread))) continue;
    const isInInbox = thread.messages.some(
      (message) =>
        message.labelIds?.includes(GmailLabel.INBOX) ||
        (inboxFolderId && message.parentFolderId === inboxFolderId),
    );
    if (!isInInbox) continue;

    const isUnread = isThreadUnread(thread.messages);
    if (isUnread === !read) continue;
    delta += read ? -1 : 1;
  }

  return delta;
}
