import { atom } from "jotai";

export const refetchEmailListAtom = atom<
  { refetch: (options?: { removedThreadIds?: string[] }) => void } | undefined
>(undefined);
