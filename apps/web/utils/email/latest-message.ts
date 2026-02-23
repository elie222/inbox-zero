export function getLatestNonDraftMessage<T>({
  messages,
  isDraft,
  getTimestamp,
}: {
  messages: T[];
  isDraft: (message: T) => boolean;
  getTimestamp: (message: T) => number;
}): T | null {
  const nonDraftMessages = messages.filter((message) => !isDraft(message));
  if (!nonDraftMessages.length) return null;

  const sortedMessages = [...nonDraftMessages].sort(
    (a, b) => getTimestamp(b) - getTimestamp(a),
  );

  return sortedMessages[0];
}
