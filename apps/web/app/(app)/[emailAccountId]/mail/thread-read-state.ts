import type { ListThread } from "./types";
import { GmailLabel } from "@/utils/gmail/label";

export function isThreadUnread(thread: ListThread) {
  return thread.messages.some((message) =>
    message.labelIds?.includes(GmailLabel.UNREAD),
  );
}

export function markThreadRead(thread: ListThread) {
  if (!isThreadUnread(thread)) return thread;

  return {
    ...thread,
    messages: thread.messages.map((message) =>
      message.labelIds?.includes(GmailLabel.UNREAD)
        ? {
            ...message,
            labelIds: message.labelIds.filter(
              (label) => label !== GmailLabel.UNREAD,
            ),
          }
        : message,
    ),
  };
}
