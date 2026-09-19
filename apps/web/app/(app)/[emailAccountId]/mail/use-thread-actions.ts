"use client";

import { useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { randomUuid } from "@/utils/uuid";
import {
  getListThreadEmailAccountId,
  getListThreadKey,
  getListThreadMessageIds,
  type ListThread,
} from "./types";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import {
  mutationPayloadToChange,
  type ThreadMutationPayload,
} from "@/utils/mail-engine/mutation-change";
import { submitConversationChange } from "@/utils/mail-engine/submit-conversations";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";

type UndoableAction = "archive" | "trash";

type ThreadSnapshot = {
  emailAccountId: string;
  key: string;
  messageIds: string[];
  mutationId: string;
  threadId: string;
};

type ThreadActionTarget = Omit<ThreadSnapshot, "mutationId">;

type UndoableBatch = {
  action: UndoableAction;
  snapshots: ThreadSnapshot[];
  undone: boolean;
};

export function useThreadActions({
  emailAccountId,
  readerTarget,
  threads,
}: {
  emailAccountId: string;
  readerTarget?: ThreadActionTarget;
  threads: ListThread[];
}) {
  const lastAction = useRef<UndoableBatch | null>(null);
  const retainedEmailAccountId = useRef(emailAccountId);
  const listTargetsByKey = useRef(new Map<string, ThreadActionTarget>());
  const activeReaderTarget = useRef<ThreadActionTarget | undefined>(undefined);
  const client = useOptionalMailClient();
  useEffect(() => {
    if (retainedEmailAccountId.current !== emailAccountId) {
      retainedEmailAccountId.current = emailAccountId;
      listTargetsByKey.current.clear();
      lastAction.current = null;
    }
    activeReaderTarget.current = readerTarget?.messageIds.length
      ? readerTarget
      : undefined;
    for (const thread of threads) {
      const messageIds = [...new Set(getListThreadMessageIds(thread))];
      if (!messageIds.length) continue;
      const key = getListThreadKey(thread);
      listTargetsByKey.current.set(key, {
        emailAccountId: getListThreadEmailAccountId(thread, emailAccountId),
        key,
        messageIds,
        threadId: thread.id,
      });
    }
  }, [emailAccountId, readerTarget, threads]);

  const resolveTargets = useCallback(
    (threadKeys: string[]) =>
      threadKeys
        .map((key) => {
          const listTarget = listTargetsByKey.current.get(key);
          if (listTarget) return listTarget;
          return activeReaderTarget.current?.key === key
            ? activeReaderTarget.current
            : undefined;
        })
        .filter((target): target is ThreadActionTarget => Boolean(target)),
    [],
  );

  const enqueueTargets = useCallback(
    async (
      targets: ReturnType<typeof resolveTargets>,
      payload: ThreadMutationPayload,
    ) => {
      if (!targets.length || !client) {
        return { snapshots: [], rejectionCodes: [] };
      }
      const change = mutationPayloadToChange(payload);
      if (!change) return { snapshots: [], rejectionCodes: [] };
      const snapshots = [];
      const rejectionCodes: string[] = [];
      for (const target of targets) {
        const { admission, commandId } = await submitConversationChange({
          accountId: target.emailAccountId,
          change,
          client,
          conversationId: target.threadId,
        });
        if (admission.status === "rejected") {
          rejectionCodes.push(admission.code);
          continue;
        }
        snapshots.push({ ...target, mutationId: commandId });
      }
      return { snapshots, rejectionCodes };
    },
    [client],
  );

  const undoBatch = useCallback(
    async (batch: UndoableBatch) => {
      if (batch.undone || !client) return [];
      batch.undone = true;
      if (lastAction.current === batch) lastAction.current = null;

      const compensation = mutationPayloadToChange(
        batch.action === "archive"
          ? { kind: "unarchive" }
          : { kind: "untrash" },
      );
      if (!compensation) return [];
      const results = await Promise.allSettled(
        batch.snapshots.map(async (snapshot) => {
          const cancelled =
            (
              await client.cancelOperation({
                accountId: snapshot.emailAccountId,
                operationId: snapshot.mutationId,
              })
            ).status === "cancelled";
          if (!cancelled) {
            const diagnostics = await client.getDiagnostics(
              snapshot.emailAccountId,
            );
            await client.submitConversations({
              accountId: snapshot.emailAccountId,
              commandId: randomUuid(),
              conversations: [
                {
                  accountId: snapshot.emailAccountId,
                  conversationId: snapshot.threadId,
                },
              ],
              change: compensation,
              observedRevision: diagnostics.revision,
            });
          }
          return snapshot.key;
        }),
      );
      const restoredKeys = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failedCount = results.length - restoredKeys.length;

      if (restoredKeys.length) {
        toast.success(summarise("Restored", restoredKeys.length));
      }
      if (failedCount) {
        toast.error(
          failedCount === results.length
            ? "Couldn't restore"
            : `Couldn't restore ${failedCount} of ${results.length}`,
        );
      }
      if (!restoredKeys.length) {
        batch.undone = false;
        lastAction.current = batch;
      }
      return restoredKeys;
    },
    [client],
  );

  const undo = useCallback(async () => {
    const batch = lastAction.current;
    return batch ? undoBatch(batch) : [];
  }, [undoBatch]);

  const runUndoable = useCallback(
    async (action: UndoableAction, threadKeys: string[]) => {
      const targets = resolveTargets(threadKeys);
      const { snapshots, rejectionCodes } = await enqueueTargets(targets, {
        kind: action,
      });
      if (!snapshots.length) {
        if (threadKeys.length) {
          toast.error(
            enqueueFailureCopy(
              action === "archive"
                ? "Couldn't queue archiving"
                : "Couldn't queue deletion",
              rejectionCodes,
            ),
          );
        }
        return [];
      }

      const batch: UndoableBatch = { action, snapshots, undone: false };
      lastAction.current = batch;
      const failedCount = threadKeys.length - snapshots.length;
      toastUndo({
        message: summarise(
          action === "archive" ? "Archived" : "Deleted",
          snapshots.length,
        ),
        shortcut: getShortcutHint("undo"),
        onUndo: () => {
          undoBatch(batch);
        },
      });
      if (failedCount) {
        toast.error(
          enqueueFailureCopy(
            action === "archive"
              ? `Couldn't queue ${failedCount} of ${threadKeys.length} for archiving`
              : `Couldn't queue ${failedCount} of ${threadKeys.length} for deletion`,
            rejectionCodes,
          ),
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets, undoBatch],
  );

  const setReadState = useCallback(
    async (threadKeys: string[], read: boolean, notifySuccess = true) => {
      const targets = resolveTargets(threadKeys);
      const { snapshots, rejectionCodes } = await enqueueTargets(targets, {
        kind: "set_read_state",
        read,
      });
      const failedCount = threadKeys.length - snapshots.length;
      if (snapshots.length && notifySuccess) {
        toast.success(
          snapshots.length === 1
            ? `Marked as ${read ? "read" : "unread"}`
            : `Marked ${snapshots.length} conversations as ${read ? "read" : "unread"}`,
        );
      }
      if (failedCount) {
        toast.error(
          enqueueFailureCopy(
            failedCount === threadKeys.length
              ? `Couldn't queue marking as ${read ? "read" : "unread"}`
              : `Couldn't queue ${failedCount} of ${threadKeys.length} as ${read ? "read" : "unread"}`,
            rejectionCodes,
          ),
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets],
  );

  const setStarredState = useCallback(
    async (threadKeys: string[], starred: boolean) => {
      const { snapshots, rejectionCodes } = await enqueueTargets(
        resolveTargets(threadKeys),
        {
          kind: "set_starred_state",
          starred,
        },
      );
      if (snapshots.length < threadKeys.length) {
        toast.error(
          enqueueFailureCopy(
            "Couldn’t update stars for all conversations",
            rejectionCodes,
          ),
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets],
  );

  const snooze = useCallback(
    async (threadKeys: string[], snoozedUntil: Date) => {
      const targets = resolveTargets(threadKeys);
      const { snapshots, rejectionCodes } = await enqueueTargets(targets, {
        kind: "snooze",
        scheduledFor: snoozedUntil.toISOString(),
      });
      const failedCount = threadKeys.length - snapshots.length;
      if (snapshots.length) {
        toast.success(
          snapshots.length === 1
            ? `Snoozed until ${format(snoozedUntil, "EEE, MMM d 'at' p")}`
            : `Snoozed ${snapshots.length} conversations`,
        );
      }
      if (failedCount) {
        toast.error(
          enqueueFailureCopy(
            failedCount === threadKeys.length
              ? threadKeys.length === 1
                ? "Couldn't queue snoozing"
                : "Couldn't queue snoozing conversations"
              : `Couldn't queue ${failedCount} of ${threadKeys.length} for snoozing`,
            rejectionCodes,
          ),
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets],
  );

  const markSpam = useCallback(
    async (threadKeys: string[]) => {
      const targets = resolveTargets(threadKeys);
      const { snapshots, rejectionCodes } = await enqueueTargets(targets, {
        kind: "spam",
      });
      const failedCount = threadKeys.length - snapshots.length;
      if (snapshots.length) {
        toast.success(
          snapshots.length === 1
            ? "Marked as spam"
            : `Marked ${snapshots.length} conversations as spam`,
        );
      }
      if (failedCount) {
        toast.error(
          enqueueFailureCopy(
            failedCount === threadKeys.length
              ? "Couldn't queue marking as spam"
              : `Couldn't queue ${failedCount} of ${threadKeys.length} as spam`,
            rejectionCodes,
          ),
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets],
  );

  return {
    archive: useCallback(
      (threadKeys: string[]) => runUndoable("archive", threadKeys),
      [runUndoable],
    ),
    trash: useCallback(
      (threadKeys: string[]) => runUndoable("trash", threadKeys),
      [runUndoable],
    ),
    markRead: useCallback(
      (threadKeys: string[]) => setReadState(threadKeys, true, false),
      [setReadState],
    ),
    markSpam,
    setReadState,
    setStarredState,
    snooze,
    undo,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}

function enqueueFailureCopy(generic: string, rejectionCodes: string[]) {
  return admissionRejectionCopy(rejectionCodes[0]) ?? generic;
}
