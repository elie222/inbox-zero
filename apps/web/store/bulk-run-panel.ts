import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const dismissedBulkRunsAtom = atomWithStorage<string[]>(
  "inbox-zero-dismissed-bulk-runs",
  [],
);

export const bulkRunPanelAtom = atom<{
  open: boolean;
  emailAccountId: string;
  runId?: string;
}>({ open: false, emailAccountId: "" });
