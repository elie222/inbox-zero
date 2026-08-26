"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMailMutationOverlay } from "@/utils/email-cache/mail-mutation-overlay";
import {
  getActiveMailMutations,
  getMailMutations,
  isActiveMailMutationStatus,
  type MailMutation,
  subscribeToMailMutations,
} from "@/utils/email-cache/mail-mutations";
import type { ParsedMessage } from "@/utils/types";

type MutationSnapshot = {
  identity: string;
  mutations: MailMutation[];
  readable?: boolean;
};

type OverlayMessage = Pick<ParsedMessage, "id" | "labelIds">;

type ReconciliationState = {
  emailAccountId: string;
  isRunning: boolean;
  pendingIds: Set<string>;
  retryAttempts: number;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  stopped: boolean;
};

const RECONCILIATION_RETRY_MS = 1000;
const MAX_RECONCILIATION_RETRY_MS = 30_000;

export function useMailMutationOverlay({
  emailAccountIds,
  enabled,
  onMutationsEnqueued,
}: {
  emailAccountIds: string[];
  enabled: boolean;
  onMutationsEnqueued?: (mutations: MailMutation[]) => void;
}) {
  const accountIdentity = useMemo(
    () => [...new Set(emailAccountIds)].sort().join("\u0000"),
    [emailAccountIds],
  );
  const identity = enabled ? accountIdentity || "*" : "disabled";
  const [snapshot, setSnapshot] = useState<MutationSnapshot>();
  const onMutationsEnqueuedRef = useRef(onMutationsEnqueued);

  useEffect(() => {
    onMutationsEnqueuedRef.current = onMutationsEnqueued;
  }, [onMutationsEnqueued]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot({ identity, mutations: [], readable: true });
      return;
    }

    let cancelled = false;
    let generation = 0;
    const accountIds = new Set(accountIdentity.split("\u0000").filter(Boolean));
    const scopedAccountId =
      accountIds.size === 1 ? accountIds.values().next().value : undefined;
    const load = () => {
      const currentGeneration = ++generation;
      getActiveMailMutations(scopedAccountId)
        .then((mutations) => {
          if (cancelled || currentGeneration !== generation) return;
          setSnapshot({
            identity,
            readable: true,
            mutations: accountIds.size
              ? mutations.filter((mutation) =>
                  accountIds.has(mutation.emailAccountId),
                )
              : mutations,
          });
        })
        .catch(() => {
          if (cancelled || currentGeneration !== generation) return;
          setSnapshot({ identity, mutations: [], readable: false });
        });
    };
    const unsubscribe = subscribeToMailMutations((mutations) => {
      const matchingMutations = mutations?.filter(
        (mutation) =>
          !accountIds.size || accountIds.has(mutation.emailAccountId),
      );
      if (matchingMutations?.length) {
        onMutationsEnqueuedRef.current?.(matchingMutations);
      }
      load();
    });
    load();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [accountIdentity, enabled, identity]);

  return {
    isReady: !enabled || snapshot?.identity === identity,
    isReadable: !enabled || snapshot?.readable !== false,
    mutations: snapshot?.identity === identity ? snapshot.mutations : [],
  };
}

export function useRetainedMailMutationOverlay({
  emailAccountId,
  enabled = Boolean(emailAccountId),
  onReconcile,
}: {
  emailAccountId: string;
  enabled?: boolean;
  onReconcile: () => unknown;
}) {
  const retainMutationsRef = useRef<(mutations: MailMutation[]) => void>(
    () => {},
  );
  const active = useMailMutationOverlay({
    emailAccountIds: [emailAccountId],
    enabled,
    onMutationsEnqueued: (mutations) => retainMutationsRef.current(mutations),
  });
  const onReconcileRef = useRef(onReconcile);
  const previous = useRef<MutationSnapshot | undefined>(undefined);
  const reconciliationState = useRef<ReconciliationState>(
    createReconciliationState(emailAccountId),
  );
  const runReconciliationRef = useRef<() => void>(() => {});
  const [retained, setRetained] = useState<MutationSnapshot>();

  useEffect(() => {
    onReconcileRef.current = onReconcile;
  }, [onReconcile]);

  useEffect(() => {
    const previousState = reconciliationState.current;
    if (previousState.emailAccountId !== emailAccountId) {
      previousState.stopped = true;
      if (previousState.retryTimer) clearTimeout(previousState.retryTimer);
      reconciliationState.current = createReconciliationState(emailAccountId);
    }
    const state = reconciliationState.current;
    state.stopped = !enabled;
    return () => {
      state.stopped = true;
      if (state.retryTimer) clearTimeout(state.retryTimer);
    };
  }, [emailAccountId, enabled]);

  useEffect(() => {
    if (enabled) return;
    previous.current = undefined;
    const state = reconciliationState.current;
    state.pendingIds.clear();
    state.retryAttempts = 0;
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.retryTimer = undefined;
    setRetained(undefined);
  }, [enabled]);

  const runReconciliation = useCallback(() => {
    const state = reconciliationState.current;
    if (
      state.stopped ||
      state.isRunning ||
      state.retryTimer ||
      !state.pendingIds.size
    ) {
      return;
    }

    state.isRunning = true;
    const completedIds = new Set(state.pendingIds);
    Promise.resolve()
      .then(() => onReconcileRef.current())
      .then(() => {
        if (state.stopped || reconciliationState.current !== state) return;
        for (const id of completedIds) state.pendingIds.delete(id);
        state.retryAttempts = 0;
        setRetained((snapshot) => {
          if (snapshot?.identity !== state.emailAccountId) return snapshot;
          return {
            ...snapshot,
            mutations: snapshot.mutations.filter(
              (mutation) => !completedIds.has(mutation.id),
            ),
          };
        });
      })
      .catch(() => {
        if (state.stopped || reconciliationState.current !== state) return;
        const delay = Math.min(
          RECONCILIATION_RETRY_MS * 2 ** state.retryAttempts,
          MAX_RECONCILIATION_RETRY_MS,
        );
        state.retryAttempts += 1;
        state.retryTimer = setTimeout(() => {
          state.retryTimer = undefined;
          if (state.stopped || reconciliationState.current !== state) return;
          runReconciliationRef.current();
        }, delay);
      })
      .finally(() => {
        state.isRunning = false;
        if (
          !state.stopped &&
          reconciliationState.current === state &&
          !state.retryTimer &&
          state.pendingIds.size
        ) {
          queueMicrotask(() => runReconciliationRef.current());
        }
      });
  }, []);

  useEffect(() => {
    runReconciliationRef.current = runReconciliation;
  }, [runReconciliation]);

  const reconcileCompleted = useCallback(
    (ids: string[]) => {
      const state = reconciliationState.current;
      if (state.emailAccountId !== emailAccountId || state.stopped) return;
      for (const id of ids) state.pendingIds.add(id);
      runReconciliation();
    },
    [emailAccountId, runReconciliation],
  );

  const retainMutations = useCallback(
    (mutations: MailMutation[]) => {
      if (!mutations.length) return;
      setRetained((snapshot) => ({
        identity: emailAccountId,
        mutations: mergeMutations(
          snapshot?.identity === emailAccountId ? snapshot.mutations : [],
          mutations,
        ),
      }));
      previous.current = {
        identity: emailAccountId,
        mutations: mergeMutations(
          previous.current?.identity === emailAccountId
            ? previous.current.mutations
            : [],
          mutations,
        ),
      };

      const ids = mutations.map((mutation) => mutation.id);
      getMailMutations(ids)
        .then((stored) => {
          const activeIds = new Set(
            stored
              .filter((mutation) => isActiveMailMutationStatus(mutation.status))
              .map((mutation) => mutation.id),
          );
          reconcileCompleted(ids.filter((id) => !activeIds.has(id)));
        })
        .catch(() => {});
    },
    [emailAccountId, reconcileCompleted],
  );
  useEffect(() => {
    retainMutationsRef.current = retainMutations;
  }, [retainMutations]);

  useEffect(() => {
    if (!active.isReady || !active.isReadable) return;

    const prior =
      previous.current?.identity === emailAccountId
        ? previous.current.mutations
        : [];
    const activeIds = new Set(active.mutations.map((mutation) => mutation.id));
    const completedIds = new Set(
      prior
        .filter((mutation) => !activeIds.has(mutation.id))
        .map((mutation) => mutation.id),
    );

    setRetained((snapshot) => ({
      identity: emailAccountId,
      mutations: mergeMutations(
        snapshot?.identity === emailAccountId ? snapshot.mutations : [],
        active.mutations,
      ),
    }));
    previous.current = {
      identity: emailAccountId,
      mutations: active.mutations,
    };

    reconcileCompleted([...completedIds]);
  }, [
    active.isReadable,
    active.isReady,
    active.mutations,
    emailAccountId,
    reconcileCompleted,
  ]);

  let mutations: MailMutation[] = [];
  if (enabled) {
    mutations =
      retained?.identity === emailAccountId
        ? mergeMutations(retained.mutations, active.mutations)
        : active.mutations;
  }

  return {
    isReady: active.isReady,
    isReadable: active.isReadable,
    mutations,
    retainMutations,
  };
}

export function applyMailMutationOverlayToThreads<
  Thread extends { id: string; messages?: OverlayMessage[] },
>({
  getEmailAccountId,
  mutations,
  threads,
}: {
  getEmailAccountId: (thread: Thread) => string;
  mutations: MailMutation[];
  threads: Thread[];
}): Thread[] {
  const overlay = createMailMutationOverlay(mutations);
  const overlaidThreads: Thread[] = [];
  for (const thread of threads) {
    const emailAccountId = getEmailAccountId(thread);
    const currentMessages = thread.messages ?? [];
    if (
      overlay.isThreadHidden(
        emailAccountId,
        thread.id,
        currentMessages.map((message) => message.id),
      )
    ) {
      continue;
    }

    const messages = overlay.applyToMessages(
      emailAccountId,
      currentMessages as ParsedMessage[],
    ) as NonNullable<Thread["messages"]>;
    const messagesUnchanged =
      messages.length === currentMessages.length &&
      messages.every((message, index) => message === currentMessages[index]);
    overlaidThreads.push(messagesUnchanged ? thread : { ...thread, messages });
  }
  return overlaidThreads;
}

function createReconciliationState(
  emailAccountId: string,
): ReconciliationState {
  return {
    emailAccountId,
    isRunning: false,
    pendingIds: new Set<string>(),
    retryAttempts: 0,
    retryTimer: undefined,
    stopped: false,
  };
}

function mergeMutations(left: MailMutation[], right: MailMutation[]) {
  const mutations = new Map(left.map((mutation) => [mutation.id, mutation]));
  for (const mutation of right) mutations.set(mutation.id, mutation);
  return [...mutations.values()];
}
