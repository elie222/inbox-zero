import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { toastError, toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { OperationStatus } from "@inboxzero/mail-core/operations";
import { cancelSendAttachments } from "@/utils/mail-engine/stage-attachments";

export const UNDO_SEND_DELAY_MS = 30_000;
const UNDO_SEND_TOAST_ID = "undo-send";
// The server holds the send while it is executing or verifying, so undo stays
// open until the send leaves it or the window ends.
const UNDOABLE_STATUSES = new Set<OperationStatus>([
  "preparing",
  "queued",
  "executing",
  "verifying",
  "retry_wait",
]);

type PendingUndoSend = {
  client: MailClient;
  operationId: string;
  emailAccountId: string;
  attachmentIds: string[];
  restoreComposer: () => void;
  undone: boolean;
  release: () => void;
  toastId: string;
};

let pending: PendingUndoSend | null = null;
const listeners = new Set<() => void>();

export function getUndoSendHoldUntil(online: boolean, now = Date.now()) {
  return online ? now + UNDO_SEND_DELAY_MS : undefined;
}

/** The send whose undo window is open, so its message can offer Undo. */
export function useUndoableSendId() {
  return useSyncExternalStore(
    subscribe,
    () => pending?.operationId ?? null,
    () => null,
  );
}

export function beginUndoSend({
  client,
  operationId,
  emailAccountId,
  attachmentIds = [],
  restoreComposer,
  holdUntil,
}: {
  client: MailClient;
  operationId: string;
  emailAccountId: string;
  attachmentIds?: string[];
  restoreComposer: () => void;
  holdUntil: number;
}) {
  const duration = holdUntil - Date.now();
  if (duration <= 0) return;
  releasePreviousOffer();
  const handle = client.observeOperation({
    accountId: emailAccountId,
    operationId,
  });
  let unsubscribe = () => {};
  const toastId = undoSendToastId(operationId);
  const current: PendingUndoSend = {
    client,
    operationId,
    emailAccountId,
    attachmentIds,
    restoreComposer,
    undone: false,
    toastId,
    release: () => {
      clearTimeout(timeout);
      unsubscribe();
      handle.close();
    },
  };
  const timeout = setTimeout(() => clearUndoSendOffer(current), duration);
  setPending(current);
  const inspect = () => {
    if (pending !== current || current.undone) return;
    const status = handle.getSnapshot().data?.status;
    if (status && !UNDOABLE_STATUSES.has(status)) clearUndoSendOffer(current);
  };
  unsubscribe = handle.subscribe(inspect);
  toastUndo({
    id: toastId,
    message: "Email sent!",
    shortcut: getShortcutHint("undo"),
    duration,
    onUndo: async () => {
      await undoPendingSend();
    },
  });
  inspect();
}

/** Undoes the open send, or only `operationId` when a message asks for it. */
export async function undoPendingSend(operationId?: string) {
  const current = pending;
  if (!current || current.undone) return false;
  if (operationId && current.operationId !== operationId) return false;
  current.undone = true;
  const result = await current.client.cancelOperation({
    accountId: current.emailAccountId,
    operationId: current.operationId,
  });
  if (result.status === "unavailable") {
    // The send is still held, so the user can try again within the window.
    current.undone = false;
    toastError({
      description: "Couldn't reach the server to undo. Try again.",
    });
    return false;
  }
  if (pending === current) {
    setPending(null);
    current.release();
  }
  toast.dismiss(current.toastId);
  if (result.status !== "cancelled") {
    current.undone = false;
    toastError({
      description:
        result.status === "too_late"
          ? "Too late to undo. This email was already sent."
          : "Couldn't undo send",
    });
    return false;
  }
  current.restoreComposer();
  try {
    await cancelSendAttachments(current.emailAccountId, current.attachmentIds);
  } catch {
    // The send is already cancelled; tmpdir cleanup remains the backstop.
  }
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setPending(next: PendingUndoSend | null) {
  pending = next;
  for (const listener of listeners) listener();
}

function releasePreviousOffer() {
  const previous = pending;
  if (!previous) return;
  previous.undone = true;
  setPending(null);
  previous.release();
  toast.dismiss(previous.toastId);
}

function clearUndoSendOffer(offer: PendingUndoSend) {
  if (pending !== offer || offer.undone) return;
  setPending(null);
  offer.release();
  toast.dismiss(offer.toastId);
}

function undoSendToastId(operationId: string) {
  return `${UNDO_SEND_TOAST_ID}:${operationId}`;
}
