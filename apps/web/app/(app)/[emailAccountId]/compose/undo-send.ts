import { toast } from "sonner";
import { toastError, toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import type { MailClient } from "@inboxzero/mail-core/engine";

export const UNDO_SEND_DELAY_MS = 5000;
const UNDO_SEND_TOAST_ID = "undo-send";

type PendingUndoSend = {
  client: MailClient;
  operationId: string;
  emailAccountId: string;
  restoreComposer: () => void;
  undone: boolean;
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
  pending = {
    client,
    operationId,
    emailAccountId,
    restoreComposer,
    undone: false,
  };
  toastUndo({
    id: UNDO_SEND_TOAST_ID,
    message: "Email sent!",
    shortcut: getShortcutHint("undo"),
    duration,
    onUndo: async () => {
      await undoPendingSend();
    },
  });
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
    if (pending === current) pending = null;
    toastError({ description: "Couldn't undo send" });
    return false;
  }
  if (pending === current) pending = null;
  toast.dismiss(UNDO_SEND_TOAST_ID);
  current.restoreComposer();
  return true;
}
