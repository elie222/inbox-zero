import { toast } from "sonner";
import { toastError, toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import {
  restoreReplyFromOutbox,
  type ReplyDraftIdentity,
} from "@/utils/email-cache/reply-drafts";

export const UNDO_SEND_DELAY_MS = 5000;

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
}: {
  mutationId: string;
  emailAccountId: string;
  identity: ReplyDraftIdentity;
  restoreComposer: () => void;
}) {
  pending = {
    mutationId,
    emailAccountId,
    identity,
    restoreComposer,
    undone: false,
  };
  toastUndo({
    message: "Email sent!",
    shortcut: getShortcutHint("undo"),
    duration: UNDO_SEND_DELAY_MS,
    onUndo: () => {
      undoPendingSend().catch(() => {});
    },
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
    current.undone = false;
    if (pending === current) pending = null;
    toastError({ description: "Couldn't undo send" });
    return false;
  }
  if (pending === current) pending = null;
  toast.dismiss("undo");
  current.restoreComposer();
  return true;
}
