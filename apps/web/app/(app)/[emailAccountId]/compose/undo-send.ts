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
  const handle = client.observeOperation({
    accountId: emailAccountId,
    operationId,
  });
  let unsubscribe = () => {};
  const timeout = setTimeout(clearUndoSendOffer, duration);
  const current: PendingUndoSend = {
    client,
    operationId,
    emailAccountId,
    restoreComposer,
    undone: false,
    release: () => {
      clearTimeout(timeout);
      unsubscribe();
      handle.close();
    },
  };
  pending = current;
  const inspect = () => {
    if (pending !== current || current.undone) return;
    const status = handle.getSnapshot().data?.status;
    if (status && !canCancelOperation(status)) clearUndoSendOffer();
  };
  unsubscribe = handle.subscribe(inspect);
  toastUndo({
    id: UNDO_SEND_TOAST_ID,
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
    toast.dismiss(UNDO_SEND_TOAST_ID);
    toastError({ description: "Couldn't undo send" });
    return false;
  }
  if (pending === current) {
    pending = null;
    current.release();
  }
  toast.dismiss(UNDO_SEND_TOAST_ID);
  current.restoreComposer();
  return true;
}

function clearUndoSendOffer() {
  const current = pending;
  if (!current || current.undone) return;
  pending = null;
  current.release();
  toast.dismiss(UNDO_SEND_TOAST_ID);
}
