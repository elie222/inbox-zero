// A draft that a pending send stands in for isn't shown, so it doesn't title
// the thread either.
export function latestShownMessage<T extends { id: string }>(
  messages: T[],
  hiddenDraftMessageIds: string[],
) {
  return messages.findLast(
    (message) => !hiddenDraftMessageIds.includes(message.id),
  );
}
