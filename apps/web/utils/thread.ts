// The first message id in a thread is the threadId
export function isReplyInThread(messageId: string, threadId: string) {
  return messageId !== threadId;
}
