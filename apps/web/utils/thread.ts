// The first message id in a thread is the threadId
export function isReplyInThread(messageId: string, threadId: string): boolean {
  return !!(messageId && messageId !== threadId);
}
