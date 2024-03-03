"use client";

import { atom } from "jotai";
import { jotaiStore } from "@/store";
import uniq from "lodash/uniq";

export const aiQueueAtom = atom<string[]>([]);
export const pushToAiQueueAtom = (ids: string[]) => {
  const currentIds = jotaiStore.get(aiQueueAtom);
  const newIds = uniq([...currentIds, ...ids]);
  jotaiStore.set(aiQueueAtom, newIds);
};
export const removeFromAiQueueAtom = (id: string) => {
  const currentIds = jotaiStore.get(aiQueueAtom);
  const newIds = currentIds.filter((i) => i !== id);
  jotaiStore.set(aiQueueAtom, newIds);
};
