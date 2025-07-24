import { isOutlookReplyInThread } from "@/utils/outlook/message";
import { isGmailReplyInThread } from "@/utils/gmail/message";
import type { ParsedMessage } from "@/utils/types";

export function isReplyInThread(message: ParsedMessage): boolean {
  switch (message.metadata.provider) {
    case "gmail":
      return isGmailReplyInThread(message);
    case "outlook":
      return isOutlookReplyInThread(message);
    default:
      return false;
  }
}
