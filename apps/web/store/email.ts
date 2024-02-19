import { atom } from "jotai";

export const selectedEmailAtom = atom<string | undefined>(undefined);
export const refetchEmailListAtom = atom<
  { refetch: (removedThreadIds?: string[]) => void } | undefined
>(undefined);
