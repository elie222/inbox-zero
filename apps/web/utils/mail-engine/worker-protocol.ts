import type { QuerySnapshot } from "@inboxzero/mail-core/queries";

export type BrowserEngineStart = {
  accountId: string;
  provider: "google" | "microsoft";
  generation?: string;
  persist?: boolean;
  maxPendingOperations?: number;
  online?: boolean;
};

export function shouldReleaseDeferredOnStart(online?: boolean) {
  return online !== false;
}

export type WorkerRequest =
  | { id: string; type: "start"; input: BrowserEngineStart }
  | { id: string; type: "call"; method: string; args: unknown[] }
  | {
      id: string;
      type: "observe";
      kind: "mailbox" | "conversation" | "operation";
      handleId: string;
      args: unknown[];
    }
  | { id: string; type: "unobserve"; handleId: string }
  | { id: string; type: "close" };

export type WorkerResponse =
  | { id: string; type: "ok"; value?: unknown }
  | { id: string; type: "error"; message: string }
  | { type: "snapshot"; handleId: string; snapshot: QuerySnapshot<unknown> };

export function browserMailEngineCapabilities() {
  return {
    worker: typeof Worker !== "undefined",
    locks:
      typeof navigator !== "undefined" &&
      Boolean((navigator as Navigator & { locks?: unknown }).locks),
    opfs:
      typeof navigator !== "undefined" &&
      "storage" in navigator &&
      "getDirectory" in navigator.storage,
  };
}

export function workerStartFence(
  startedAccount: string | undefined,
  nextAccountId: string,
) {
  if (startedAccount !== undefined && startedAccount !== nextAccountId) {
    return "account_mismatch";
  }
  return null;
}

export function readPageMaxPendingOperations(): number | undefined {
  if (typeof window === "undefined") return;
  const value = window.__inboxZeroMailMaxPendingOperations;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return;
  }
  return Math.floor(value);
}

declare global {
  interface Window {
    __inboxZeroMailMaxPendingOperations?: number;
  }
}
