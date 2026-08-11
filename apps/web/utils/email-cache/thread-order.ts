export type ThreadRestorePosition = {
  threadId: string;
  index: number;
  previousThreadId?: string;
  nextThreadId?: string;
};

export function restoreThreadOrder(
  currentThreadIds: string[],
  entries: ThreadRestorePosition[],
) {
  const restoringIds = new Set(entries.map((entry) => entry.threadId));
  const restored = currentThreadIds.filter(
    (threadId) => !restoringIds.has(threadId),
  );
  const fallbackInsertions = new Map<number, number>();

  for (const entry of [...entries].sort(
    (first, second) => first.index - second.index,
  )) {
    const previousIndex = entry.previousThreadId
      ? restored.indexOf(entry.previousThreadId)
      : -1;
    const nextIndex = entry.nextThreadId
      ? restored.indexOf(entry.nextThreadId)
      : -1;

    let insertionIndex: number;
    if (previousIndex >= 0) {
      insertionIndex = previousIndex + 1;
    } else if (nextIndex >= 0) {
      insertionIndex = nextIndex;
    } else {
      const priorFallbacks = fallbackInsertions.get(entry.index) ?? 0;
      insertionIndex = Math.min(entry.index + priorFallbacks, restored.length);
      fallbackInsertions.set(entry.index, priorFallbacks + 1);
    }

    restored.splice(insertionIndex, 0, entry.threadId);
  }

  return restored;
}
