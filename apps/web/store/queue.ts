import { atom } from "jotai";
import { jotaiStore } from "@/store";

export const aiQueueAtom = atom<Set<string>>(new Set([]));
export const pushToAiQueueAtom = (pushIds: string[]) => {
  const currentIds = jotaiStore.get(aiQueueAtom);
  const newIds = new Set(currentIds);
  pushIds.forEach((id) => newIds.add(id));
  jotaiStore.set(aiQueueAtom, newIds);
};
export const removeFromAiQueueAtom = (removeId: string) => {
  const currentIds = jotaiStore.get(aiQueueAtom);
  const newIds = new Set(currentIds);
  newIds.delete(removeId);
  jotaiStore.set(aiQueueAtom, newIds);
};

export const createInAiQueueSelector = (id: string) => {
  return atom((get) => {
    const ids = get(aiQueueAtom);
    return ids.has(id);
  });
};
