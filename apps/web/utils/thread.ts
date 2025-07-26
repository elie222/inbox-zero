import { isOutlookReplyInThread } from "@/utils/outlook/message";

// The first message id in a thread is the threadId
export function isReplyInThread(
  messageId: string,
  threadId: string,
  conversationIndex: string | undefined,
): boolean {
  if (conversationIndex) {
    return isOutlookReplyInThread(conversationIndex);
  } else {
    return !!(messageId && messageId !== threadId);
  }
}
