import type { MailClient, WorkAdmission } from "@inboxzero/mail-core/engine";
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

export async function requestSyncUnlessOffline(
  online: boolean | undefined,
  sync: () => Promise<WorkAdmission>,
): Promise<WorkAdmission> {
  if (!shouldReleaseDeferredOnStart(online)) {
    return { status: "scheduled" };
  }
  return sync();
}

export function pageConnectivityOnline(): boolean | undefined {
  if (typeof navigator === "undefined") return;
  return navigator.onLine;
}

export type WorkerObserveKind =
  | "mailbox"
  | "mailboxCounts"
  | "mailboxWindow"
  | "conversation"
  | "operation";

export function observeByKind(
  client: MailClient,
  kind: WorkerObserveKind,
  args: unknown[],
) {
  switch (kind) {
    case "mailbox":
      return client.observeMailbox(args[0] as never);
    case "mailboxCounts":
      return client.observeMailboxCounts(args[0] as never);
    case "mailboxWindow":
      return (
        client.observeMailboxWindow?.(args[0] as never) ??
        client.observeMailbox(args[0] as never)
      );
    case "conversation":
      return client.observeConversation(args[0] as never, args[1] as never);
    case "operation":
      return client.observeOperation(args[0] as never);
    default: {
      const exhaustive: never = kind;
      throw new Error(`unsupported observe kind ${exhaustive}`);
    }
  }
}

export type WorkerRequest =
  | { id: string; type: "start"; input: BrowserEngineStart }
  | { id: string; type: "call"; method: string; args: unknown[] }
  | {
      id: string;
      type: "observe";
      kind: WorkerObserveKind;
      handleId: string;
      args: unknown[];
    }
  | { id: string; type: "loadMore"; handleId: string }
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
