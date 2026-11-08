"use client";

import { useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import groupBy from "lodash/groupBy";
import { toast } from "sonner";
import { releaseLatestToastUndo, toastUndo } from "@/components/Toast";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { randomUuid } from "@/utils/uuid";
import {
  getListThreadEmailAccountId,
  getListThreadKey,
  getListThreadMessageIds,
  type ListThread,
} from "./types";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { MetadataChange } from "@inboxzero/mail-core/commands";
import { submitConversationChanges } from "@/utils/mail-engine/submit-conversations";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";

/** Engine changes queued in order; an action is undoable when every step has a compensation. */
type UndoableAction = {
  steps: Array<{
    change: MetadataChange;
    compensation?: MetadataChange;
    /** Leaves out threads the change didn't alter, such as a label they already had. */
    compensates?: (target: ThreadActionTarget) => boolean;
  }>;
  done: (count: number) => string;
  noun: string;
  /** Undo brings the threads back into view, so the reader can return to them. */
  removesFromView: boolean;
};

type ThreadSnapshot = {
  emailAccountId: string;
  key: string;
  /** Labels any of the thread's loaded messages carries. */
  labelIds: string[];
  messageIds: string[];
  mutationId: string;
  threadId: string;
};

export type ThreadActionTarget = Omit<ThreadSnapshot, "mutationId">;

type UndoStep = { compensation: MetadataChange; snapshots: ThreadSnapshot[] };

type UndoableBatch = {
  removesFromView: boolean;
  steps: UndoStep[];
  targets: ThreadActionTarget[];
  undone: boolean;
};

export function useThreadActions({
  emailAccountId,
  onRestore,
  readerTarget,
  threads,
}: {
  emailAccountId: string;
  onRestore?: (targets: ThreadActionTarget[]) => void;
  readerTarget?: ThreadActionTarget;
  threads: ListThread[];
}) {
  const lastAction = useRef<UndoableBatch | null>(null);
  const pendingUndoable = useRef<Promise<unknown>>(Promise.resolve());
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
        labelIds: [
          ...new Set(
            thread.messages.flatMap((message) => message.labelIds ?? []),
          ),
        ],
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
      change: MetadataChange,
    ) => {
      const snapshots: ThreadSnapshot[] = [];
      const rejectionCodes: string[] = [];
      if (!targets.length || !client) return { snapshots, rejectionCodes };
      for (const [accountId, accountTargets] of Object.entries(
        groupBy(targets, (target) => target.emailAccountId),
      )) {
        const result = await submitConversationChanges({
          accountId,
          change,
          client,
          conversationIds: accountTargets.map((target) => target.threadId),
        });
        rejectionCodes.push(...result.rejectionCodes);
        const commandIds = new Map(
          result.accepted.map((item) => [item.conversationId, item.commandId]),
        );
        for (const target of accountTargets) {
          const mutationId = commandIds.get(target.threadId);
          if (mutationId) snapshots.push({ ...target, mutationId });
        }
      }
      return { snapshots, rejectionCodes };
    },
    [client],
  );

  /** Returns the keys of threads whose steps could not be reversed. */
  const revertSteps = useCallback(
    async (
      steps: UndoStep[],
      // Cancelling drops a whole command, so a partial revert must not.
      { cancelPending }: { cancelPending: boolean },
    ) => {
      const failedKeys = new Set<string>();
      if (!client) {
        for (const step of steps) {
          for (const snapshot of step.snapshots) failedKeys.add(snapshot.key);
        }
        return failedKeys;
      }
      // Later steps were queued against the result of earlier ones, so they
      // are reversed first.
      for (const step of [...steps].reverse()) {
        const groups = Object.values(
          groupBy(step.snapshots, (snapshot) => snapshot.mutationId),
        );
        const results = await Promise.allSettled(
          groups.map(async (snapshots) => {
            const { emailAccountId, mutationId } = snapshots[0];
            if (cancelPending) {
              const cancelled = await client.cancelOperation({
                accountId: emailAccountId,
                operationId: mutationId,
              });
              if (cancelled.status === "cancelled") return;
            }
            const diagnostics = await client.getDiagnostics(emailAccountId);
            const admission = await client.submitConversations({
              accountId: emailAccountId,
              commandId: randomUuid(),
              conversations: snapshots.map((snapshot) => ({
                accountId: emailAccountId,
                conversationId: snapshot.threadId,
              })),
              change: step.compensation,
              observedRevision: diagnostics.revision,
            });
            if (admission.status === "rejected") {
              throw new Error(admission.code);
            }
          }),
        );
        results.forEach((result, index) => {
          if (result.status === "fulfilled") return;
          for (const snapshot of groups[index]) failedKeys.add(snapshot.key);
        });
      }
      return failedKeys;
    },
    [client],
  );

  const undoBatch = useCallback(
    async (batch: UndoableBatch) => {
      if (batch.undone || !client) return [];
      batch.undone = true;
      if (lastAction.current === batch) lastAction.current = null;

      const failedKeys = await revertSteps(batch.steps, {
        cancelPending: true,
      });
      const restored = batch.targets.filter(
        (target) => !failedKeys.has(target.key),
      );
      const failedCount = batch.targets.length - restored.length;

      if (restored.length) {
        toast.success(summarise("Restored", restored.length));
        if (batch.removesFromView) onRestore?.(restored);
      }
      if (failedCount) {
        toast.error(
          failedCount === batch.targets.length
            ? "Couldn't restore"
            : `Couldn't restore ${failedCount} of ${batch.targets.length}`,
        );
      }
      if (!restored.length) {
        batch.undone = false;
        lastAction.current = batch;
      }
      return restored.map((target) => target.key);
    },
    [client, onRestore, revertSteps],
  );

  const undo = useCallback(async () => {
    const batch = lastAction.current;
    return batch ? undoBatch(batch) : [];
  }, [undoBatch]);

  const admitUndoable = useCallback(
    async (action: UndoableAction, threadKeys: string[]) => {
      let queued = resolveTargets(threadKeys);
      const steps: UndoStep[] = [];
      const rejectionCodes: string[] = [];
      for (const step of action.steps) {
        if (!queued.length) break;
        const result = await enqueueTargets(queued, step.change).catch(() => ({
          snapshots: [] as ThreadSnapshot[],
          rejectionCodes: [] as string[],
        }));
        rejectionCodes.push(...result.rejectionCodes);
        if (step.compensation) {
          steps.push({
            compensation: step.compensation,
            snapshots: result.snapshots.filter(
              (snapshot) => step.compensates?.(snapshot) ?? true,
            ),
          });
        }
        const queuedKeys = new Set(result.snapshots.map(({ key }) => key));
        queued = queued.filter((target) => queuedKeys.has(target.key));
      }
      // A conversation changes fully or not at all: one that took only some
      // steps has them put back now.
      const queuedKeys = new Set(queued.map(({ key }) => key));
      const partial = steps
        .map((step) => ({
          ...step,
          snapshots: step.snapshots.filter(({ key }) => !queuedKeys.has(key)),
        }))
        .filter((step) => step.snapshots.length);
      if (partial.length) {
        const unreverted = await revertSteps(partial, { cancelPending: false });
        if (unreverted.size) {
          toast.error(
            `Couldn't fully reverse ${unreverted.size} conversation${unreverted.size === 1 ? "" : "s"} that only partly changed. Check them and try again.`,
          );
        }
      }

      if (!queued.length) {
        if (threadKeys.length) {
          toast.error(
            enqueueFailureCopy(`Couldn't queue ${action.noun}`, rejectionCodes),
          );
        }
        return [];
      }

      if (action.steps.every((step) => step.compensation)) {
        const batch: UndoableBatch = {
          removesFromView: action.removesFromView,
          steps: steps.map((step) => ({
            ...step,
            snapshots: step.snapshots.filter(({ key }) => queuedKeys.has(key)),
          })),
          targets: queued,
          undone: false,
        };
        lastAction.current = batch;
        toastUndo({
          message: action.done(queued.length),
          shortcut: getShortcutHint("undo"),
          onUndo: () => {
            undoBatch(batch);
          },
        });
      } else {
        // Undo must not reach past this action to the one before it.
        lastAction.current = null;
        releaseLatestToastUndo();
        toast.success(action.done(queued.length));
      }
      const failedCount = threadKeys.length - queued.length;
      if (failedCount) {
        toast.error(
          enqueueFailureCopy(
            `Couldn't queue ${failedCount} of ${threadKeys.length} for ${action.noun}`,
            rejectionCodes,
          ),
        );
      }
      return queued.map((target) => target.key);
    },
    [enqueueTargets, resolveTargets, revertSteps, undoBatch],
  );

  const runUndoable = useCallback(
    (action: UndoableAction, threadKeys: string[]) => {
      // Queued one after another, so the Undo toast and `z` always belong to
      // the action that finished last, even when one is still being queued.
      const admission = pendingUndoable.current.then(() =>
        admitUndoable(action, threadKeys),
      );
      pendingUndoable.current = admission.catch(() => undefined);
      return admission;
    },
    [admitUndoable],
  );

  // Undo pressed while the last action is still being queued has neither its
  // toast nor its batch to act on yet, so it would otherwise do nothing or
  // undo the action before it.
  const waitForPendingUndoable = useCallback(() => pendingUndoable.current, []);

  const setReadState = useCallback(
    async (threadKeys: string[], read: boolean, notifySuccess = true) => {
      const targets = resolveTargets(threadKeys);
      const { snapshots, rejectionCodes } = await enqueueTargets(targets, {
        kind: "set_read",
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
        { kind: "set_starred", starred },
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
        untilMs: snoozedUntil.getTime(),
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
        kind: "set_spam",
        spam: true,
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
      (threadKeys: string[]) => runUndoable(ARCHIVE, threadKeys),
      [runUndoable],
    ),
    moveToInbox: useCallback(
      (threadKeys: string[]) => runUndoable(MOVE_TO_INBOX, threadKeys),
      [runUndoable],
    ),
    trash: useCallback(
      (threadKeys: string[]) => runUndoable(TRASH, threadKeys),
      [runUndoable],
    ),
    applyLabel: useCallback(
      (
        threadKeys: string[],
        labelId: string,
        { archive = false }: { archive?: boolean } = {},
      ) => runUndoable(labelAction(labelId, archive), threadKeys),
      [runUndoable],
    ),
    moveToFolder: useCallback(
      (threadKeys: string[], folderId: string) =>
        runUndoable(
          {
            // Undo would need each message's previous folder, which the
            // list doesn't carry.
            steps: [{ change: { kind: "move", folderId } }],
            done: (count) => summarise("Moved", count),
            noun: "moving",
            removesFromView: true,
          },
          threadKeys,
        ),
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
    waitForPendingUndoable,
  };
}

const ARCHIVE: UndoableAction = {
  steps: [{ change: { kind: "archive" }, compensation: { kind: "unarchive" } }],
  done: (count) => summarise("Archived", count),
  noun: "archiving",
  removesFromView: true,
};

const MOVE_TO_INBOX: UndoableAction = {
  steps: [{ change: { kind: "unarchive" }, compensation: { kind: "archive" } }],
  done: (count) =>
    count === 1 ? "Moved to inbox" : `Moved ${count} conversations to inbox`,
  noun: "moving to inbox",
  removesFromView: true,
};

const TRASH: UndoableAction = {
  steps: [
    {
      change: { kind: "trash" },
      compensation: { kind: "restore_from_trash" },
    },
  ],
  done: (count) => summarise("Deleted", count),
  noun: "deletion",
  removesFromView: true,
};

function labelAction(labelId: string, archive: boolean): UndoableAction {
  const label = (present: boolean): MetadataChange => ({
    kind: "set_membership",
    membership: "label",
    id: labelId,
    present,
  });
  const steps: UndoableAction["steps"] = [
    {
      change: label(true),
      compensation: label(false),
      compensates: (target) => !target.labelIds.includes(labelId),
    },
  ];
  if (!archive) {
    return {
      steps,
      done: (count) =>
        count === 1
          ? "Label applied"
          : `Label applied to ${count} conversations`,
      noun: "labeling",
      removesFromView: false,
    };
  }
  return {
    steps: [
      ...steps,
      { change: { kind: "archive" }, compensation: { kind: "unarchive" } },
    ],
    done: (count) => summarise("Moved", count),
    noun: "moving",
    removesFromView: true,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}

function enqueueFailureCopy(generic: string, rejectionCodes: string[]) {
  return admissionRejectionCopy(rejectionCodes[0]) ?? generic;
}
