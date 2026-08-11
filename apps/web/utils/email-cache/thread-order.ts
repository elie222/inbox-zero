export type ThreadRestorePosition = {
  threadId: string;
  index: number;
  threadOrder?: readonly string[];
};

export function restoreThreadOrder(
  currentThreadIds: string[],
  entries: ThreadRestorePosition[],
) {
  const restoringIds = new Set(entries.map((entry) => entry.threadId));
  const retainedThreadIds = currentThreadIds.filter(
    (threadId) => !restoringIds.has(threadId),
  );
  const retainedIndexes = new Map(
    retainedThreadIds.map((threadId, index) => [threadId, index]),
  );
  const placements = [...entries]
    .sort((first, second) => first.index - second.index)
    .map((entry) => {
      const previousIndex = findExistingNeighborIndex(
        retainedIndexes,
        entry.threadOrder?.slice(0, entry.index).reverse() ?? [],
      );
      const nextIndex = findExistingNeighborIndex(
        retainedIndexes,
        entry.threadOrder?.slice(entry.index + 1) ?? [],
      );

      if (previousIndex >= 0) {
        return { entry, slot: previousIndex + 1, anchored: true };
      }
      if (nextIndex >= 0) {
        return { entry, slot: nextIndex, anchored: true };
      }
      return {
        entry,
        slot: Math.min(entry.index, retainedThreadIds.length),
        anchored: false,
      };
    });

  for (const [index, placement] of placements.entries()) {
    if (placement.anchored) continue;
    const previousAnchor = placements
      .slice(0, index)
      .findLast((candidate) => candidate.anchored);
    const nextAnchor = placements
      .slice(index + 1)
      .find((candidate) => candidate.anchored);
    if (previousAnchor) {
      placement.slot = Math.max(placement.slot, previousAnchor.slot);
    }
    if (nextAnchor) {
      placement.slot = Math.min(placement.slot, nextAnchor.slot);
    }
  }

  for (let index = 1; index < placements.length; index++) {
    placements[index]!.slot = Math.max(
      placements[index]!.slot,
      placements[index - 1]!.slot,
    );
  }

  const restoredIdsBySlot = new Map<number, string[]>();
  for (const placement of placements) {
    const threadIds = restoredIdsBySlot.get(placement.slot) ?? [];
    threadIds.push(placement.entry.threadId);
    restoredIdsBySlot.set(placement.slot, threadIds);
  }

  const restored: string[] = [];
  for (let slot = 0; slot <= retainedThreadIds.length; slot++) {
    restored.push(...(restoredIdsBySlot.get(slot) ?? []));
    const retainedThreadId = retainedThreadIds[slot];
    if (retainedThreadId) restored.push(retainedThreadId);
  }
  return restored;
}

function findExistingNeighborIndex(
  retainedIndexes: Map<string, number>,
  candidates: readonly string[],
) {
  for (const candidate of candidates) {
    const index = retainedIndexes.get(candidate);
    if (index !== undefined) return index;
  }
  return -1;
}
