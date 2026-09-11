import { toast } from "sonner";
import { toastError, toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { cancelPendingMailMutation } from "@/utils/email-cache/mail-mutations";
import {
  restoreReplyFromOutbox,
  type ReplyDraftIdentity,
} from "@/utils/email-cache/reply-drafts";

export const UNDO_SEND_DELAY_MS = 5000;
const UNDO_SEND_TOAST_ID = "undo-send";

type PendingUndoSend = {
  mutationId: string;
  emailAccountId: string;
  identity: ReplyDraftIdentity;
  restoreComposer: () => void;
  undone: boolean;
};

let pending: PendingUndoSend | null = null;

export function getUndoSendHoldUntil(online: boolean, now = Date.now()) {
  return online ? now + UNDO_SEND_DELAY_MS : undefined;
}

export function beginUndoSend({
  mutationId,
  emailAccountId,
  identity,
  restoreComposer,
  holdUntil,
}: {
  mutationId: string;
  emailAccountId: string;
  identity: ReplyDraftIdentity;
  restoreComposer: () => void;
  holdUntil: number;
}) {
  pending = {
    mutationId,
    emailAccountId,
    identity,
    restoreComposer,
    undone: false,
  };
  toastUndo({
    id: UNDO_SEND_TOAST_ID,
    message: "Email sent!",
    shortcut: getShortcutHint("undo"),
    duration: Math.max(0, holdUntil - Date.now()),
    onUndo: () => undoPendingSend(),
  });
}

export async function undoPendingSend() {
  const current = pending;
  if (!current || current.undone) return false;
  current.undone = true;
  try {
    await restoreReplyFromOutbox(
      current.mutationId,
      current.emailAccountId,
      current.identity,
    );
  } catch {
    if (!(await cancelPendingMailMutation(current.mutationId))) {
      current.undone = false;
      if (pending === current) pending = null;
      toastError({ description: "Couldn't undo send" });
      return false;
    }
    if (pending === current) pending = null;
    toast.dismiss(UNDO_SEND_TOAST_ID);
    return true;
  }
  if (pending === current) pending = null;
  toast.dismiss(UNDO_SEND_TOAST_ID);
  current.restoreComposer();
  return true;
}
