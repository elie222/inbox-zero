import { atom } from "jotai";
import { jotaiStore } from "@/store";

export const aiQueueAtom = atom<Set<string>>(new Set([]));

export const pushToAiQueueAtom = (pushIds: string[]) => {
  jotaiStore.set(aiQueueAtom, (prev) => {
    const newIds = new Set(prev);
    pushIds.forEach((id) => newIds.add(id));
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

export const createInAiQueueSelector = (id: string) => {
  return atom((get) => {
    const ids = get(aiQueueAtom);
    return ids.has(id);
  });
};
