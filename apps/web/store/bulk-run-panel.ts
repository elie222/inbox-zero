import { atom } from "jotai";

export const bulkRunPanelAtom = atom<{
  open: boolean;
  emailAccountId: string;
  runId?: string;
}>({ open: false, emailAccountId: "" });
