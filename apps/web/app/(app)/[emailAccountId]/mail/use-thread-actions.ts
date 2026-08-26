"use client";

import { useCallback, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import {
  cancelPendingMailMutation,
  enqueueMailMutation,
  type MailMutationPayload,
} from "@/utils/email-cache/mail-mutations";
import { randomUuid } from "@/utils/uuid";
import {
  getListThreadEmailAccountId,
  getListThreadKey,
  getListThreadMessageIds,
  type ListThread,
} from "./types";

type UndoableAction = "archive" | "trash";

type ThreadSnapshot = {
  emailAccountId: string;
  key: string;
  messageIds: string[];
  mutationId: string;
  threadId: string;
};

type UndoableBatch = {
  action: UndoableAction;
  snapshots: ThreadSnapshot[];
  undone: boolean;
};

export function useThreadActions({
  emailAccountId,
  threads,
}: {
  emailAccountId: string;
  threads: ListThread[];
}) {
  const lastAction = useRef<UndoableBatch | null>(null);
  const retainedEmailAccountId = useRef(emailAccountId);
  const threadsByKey = useRef(new Map<string, ListThread>());
  if (retainedEmailAccountId.current !== emailAccountId) {
    retainedEmailAccountId.current = emailAccountId;
    threadsByKey.current.clear();
    lastAction.current = null;
  }
  for (const thread of threads) {
    threadsByKey.current.set(getListThreadKey(thread), thread);
  }

  const resolveTargets = useCallback(
    (threadKeys: string[]) =>
      threadKeys
        .map((key) => {
          const thread = threadsByKey.current.get(key);
          if (!thread) return;
          const messageIds = [...new Set(getListThreadMessageIds(thread))];
          if (!messageIds.length) return;
          return {
            emailAccountId: getListThreadEmailAccountId(thread, emailAccountId),
            key,
            messageIds,
            threadId: thread.id,
          };
        })
        .filter((target): target is Omit<ThreadSnapshot, "mutationId"> =>
          Boolean(target),
        ),
    [emailAccountId],
  );

  const enqueueTargets = useCallback(
    async (
      targets: ReturnType<typeof resolveTargets>,
      payload: MailMutationPayload,
    ) => {
      if (!targets.length) return [];
      const batchId = randomUuid();
      const results = await Promise.allSettled(
        targets.map((target) =>
          enqueueMailMutation({
            ...payload,
            batchId,
            emailAccountId: target.emailAccountId,
            messageIds: target.messageIds,
            threadId: target.threadId,
          }),
        ),
      );

      return results.flatMap((result, index) => {
        const target = targets[index];
        return result.status === "fulfilled" && target
          ? [{ ...target, mutationId: result.value.id }]
          : [];
      });
    },
    [],
  );

  const undoBatch = useCallback(async (batch: UndoableBatch) => {
    if (batch.undone) return [];
    batch.undone = true;
    if (lastAction.current === batch) lastAction.current = null;

    const compensationKind =
      batch.action === "archive" ? "unarchive" : "untrash";
    const batchId = randomUuid();
    const results = await Promise.allSettled(
      batch.snapshots.map(async (snapshot) => {
        const cancelled = await cancelPendingMailMutation(snapshot.mutationId);
        if (!cancelled) {
          await enqueueMailMutation({
            batchId,
            emailAccountId: snapshot.emailAccountId,
            kind: compensationKind,
            messageIds: snapshot.messageIds,
            threadId: snapshot.threadId,
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
  }, []);

  const undo = useCallback(async () => {
    const batch = lastAction.current;
    return batch ? undoBatch(batch) : [];
  }, [undoBatch]);

  const runUndoable = useCallback(
    async (action: UndoableAction, threadKeys: string[]) => {
      const targets = resolveTargets(threadKeys);
      const snapshots = await enqueueTargets(targets, { kind: action });
      if (!snapshots.length) {
        if (threadKeys.length) {
          toast.error(
            action === "archive"
              ? "Couldn't queue archiving"
              : "Couldn't queue deletion",
          );
        }
        return [];
      }

      const batch: UndoableBatch = { action, snapshots, undone: false };
      lastAction.current = batch;
      const failedCount = threadKeys.length - snapshots.length;
      toast.success(
        summarise(
          action === "archive" ? "Archived" : "Deleted",
          snapshots.length,
        ),
        {
          action: {
            label: `Undo · ${getShortcutHint("undo")}`,
            onClick: () => {
              undoBatch(batch);
            },
          },
        },
      );
      if (failedCount) {
        toast.error(
          action === "archive"
            ? `Couldn't queue ${failedCount} of ${threadKeys.length} for archiving`
            : `Couldn't queue ${failedCount} of ${threadKeys.length} for deletion`,
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets, undoBatch],
  );

  const setReadState = useCallback(
    async (threadKeys: string[], read: boolean, notifySuccess = true) => {
      const targets = resolveTargets(threadKeys);
      const snapshots = await enqueueTargets(targets, {
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
          failedCount === threadKeys.length
            ? `Couldn't queue marking as ${read ? "read" : "unread"}`
            : `Couldn't queue ${failedCount} of ${threadKeys.length} as ${read ? "read" : "unread"}`,
        );
      }
      return snapshots.map((snapshot) => snapshot.key);
    },
    [enqueueTargets, resolveTargets],
  );

  const snooze = useCallback(
    async (threadKeys: string[], snoozedUntil: Date) => {
      const targets = resolveTargets(threadKeys);
      const snapshots = await enqueueTargets(targets, {
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
          failedCount === threadKeys.length
            ? threadKeys.length === 1
              ? "Couldn't queue snoozing"
              : "Couldn't queue snoozing conversations"
            : `Couldn't queue ${failedCount} of ${threadKeys.length} for snoozing`,
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
    setReadState,
    snooze,
    undo,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}
