import { toast } from "sonner";
import { toastError, toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { canCancelOperation } from "@inboxzero/mail-core/operations";

export const UNDO_SEND_DELAY_MS = 5000;
const UNDO_SEND_TOAST_ID = "undo-send";

type PendingUndoSend = {
  client: MailClient;
  operationId: string;
  emailAccountId: string;
  restoreComposer: () => void;
  undone: boolean;
  release: () => void;
  toastId: string;
};

let pending: PendingUndoSend | null = null;

export function getUndoSendHoldUntil(online: boolean, now = Date.now()) {
  return online ? now + UNDO_SEND_DELAY_MS : undefined;
}

export function beginUndoSend({
  client,
  operationId,
  emailAccountId,
  restoreComposer,
  holdUntil,
}: {
  client: MailClient;
  operationId: string;
  emailAccountId: string;
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
  pending = current;
  const inspect = () => {
    if (pending !== current || current.undone) return;
    const status = handle.getSnapshot().data?.status;
    if (status && !canCancelOperation(status)) clearUndoSendOffer(current);
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

export async function undoPendingSend() {
  const current = pending;
  if (!current || current.undone) return false;
  current.undone = true;
  const result = await current.client.cancelOperation({
    accountId: current.emailAccountId,
    operationId: current.operationId,
  });
  if (result.status !== "cancelled") {
    current.undone = false;
    if (pending === current) {
      pending = null;
      current.release();
    }
    toast.dismiss(current.toastId);
    toastError({ description: "Couldn't undo send" });
    return false;
  }
  if (pending === current) {
    pending = null;
    current.release();
  }
  toast.dismiss(current.toastId);
  current.restoreComposer();
  return true;
}

function releasePreviousOffer() {
  const previous = pending;
  if (!previous) return;
  previous.undone = true;
  pending = null;
  previous.release();
  toast.dismiss(previous.toastId);
}

function clearUndoSendOffer(offer: PendingUndoSend) {
  if (pending !== offer || offer.undone) return;
  pending = null;
  offer.release();
  toast.dismiss(offer.toastId);
}

function undoSendToastId(operationId: string) {
  return `${UNDO_SEND_TOAST_ID}:${operationId}`;
}
