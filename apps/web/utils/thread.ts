import { isOutlookReplyInThread } from "@/utils/outlook/message";
import { isGmailReplyInThread } from "@/utils/gmail/message";
import type { ParsedMessage } from "@/utils/types";

export function isReplyInThread(message: ParsedMessage): boolean {
  switch (message.metadata.provider) {
    case "google":
      return isGmailReplyInThread(message);
    case "microsoft-entra-id":
      return isOutlookReplyInThread(message);
    default:
      return false;
  }
}
