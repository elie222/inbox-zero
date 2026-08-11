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
  const entriesById = new Map(entries.map((entry) => [entry.threadId, entry]));
  const fallbackInsertions = new Map<number, number>();

  for (const entry of [...entries].sort(
    (first, second) => first.index - second.index,
  )) {
    const previousIndex = findExistingNeighborIndex({
      restored,
      entriesById,
      threadId: entry.previousThreadId,
      direction: "previousThreadId",
    });
    const nextIndex = findExistingNeighborIndex({
      restored,
      entriesById,
      threadId: entry.nextThreadId,
      direction: "nextThreadId",
    });

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

function findExistingNeighborIndex({
  restored,
  entriesById,
  threadId,
  direction,
}: {
  restored: string[];
  entriesById: Map<string, ThreadRestorePosition>;
  threadId: string | undefined;
  direction: "previousThreadId" | "nextThreadId";
}) {
  const visited = new Set<string>();
  let candidateId = threadId;
  while (candidateId && !visited.has(candidateId)) {
    const index = restored.indexOf(candidateId);
    if (index >= 0) return index;
    visited.add(candidateId);
    candidateId = entriesById.get(candidateId)?.[direction];
  }
  return -1;
}
