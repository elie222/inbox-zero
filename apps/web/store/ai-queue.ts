import { atom, useAtomValue } from "jotai";
import { jotaiStore } from "@/store";
import { useMemo } from "react";

const aiQueueAtom = atom<Set<string>>(new Set([]));

export const useAiQueueState = () => {
  return useAtomValue(aiQueueAtom);
};

export const pushToAiQueueAtom = (pushIds: string[]) => {
  jotaiStore.set(aiQueueAtom, (prev) => {
    const newIds = new Set(prev);
    for (const id of pushIds) {
      newIds.add(id);
    }
    return newIds;
  });
};

export const removeFromAiQueueAtom = (removeId: string) => {
  jotaiStore.set(aiQueueAtom, (prev) => {
    const remainingIds = new Set(prev);
    remainingIds.delete(removeId);
    return remainingIds;
  });
};

export const clearAiQueueAtom = () => {
  jotaiStore.set(aiQueueAtom, new Set([]));
};

const isInAiQueueAtom = atom((get) => {
  const ids = get(aiQueueAtom);
  return (id: string) => ids.has(id);
});

export const useIsInAiQueue = (id: string) => {
  const queue = useAtomValue(isInAiQueueAtom);
  return useMemo(() => queue(id), [queue, id]);
};
