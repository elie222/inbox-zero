import { GmailLabel } from "@/utils/gmail/label";

export function isThreadStarred(
  messages: readonly { labelIds?: string[] | null }[],
) {
  return messages.some((message) =>
    message.labelIds?.includes(GmailLabel.STARRED),
  );
}
