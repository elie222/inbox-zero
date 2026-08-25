"use client";

import { useEffect } from "react";
import { toastError } from "@/components/Toast";
import {
  requestMailboxSync,
  syncMailboxNow,
} from "@/app/(app)/[emailAccountId]/mail/use-mailbox-sync";
import { executeMailMutationAction } from "@/utils/actions/mail-mutation";
import type { ExecuteMailMutationBody } from "@/utils/actions/mail-mutation.validation";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { emailSendOperationResponse } from "@/utils/email-cache/email-send-operation";
import { isExpiredUnsyncedSnooze } from "@/utils/email-cache/mail-mutation-policy";
import { settleMailMutationInCache } from "@/utils/email-cache/mail-mutation-settlement";
import {
  blockMailMutationForAuth,
  claimNextMailMutationSyncGroup,
  claimNextMailMutationNotification,
  claimNextMailMutation,
  completeMailMutation,
  completeMailMutationSyncGroup,
  failMailMutation,
  getNextMailMutationWakeAt,
  markMailMutationAwaitingSync,
  type MailMutation,
  type MailMutationSyncGroup,
  renewMailMutationLease,
  renewMailMutationSyncGroupLease,
  resumeBlockedMailMutations,
  retryMailMutation,
  retryMailMutationSyncGroup,
  subscribeToMailMutations,
} from "@/utils/email-cache/mail-mutations";

const REQUEST_TIMEOUT_MS = 20 * 1000;
const LEASE_MS = 30 * 1000;
const SEND_OPERATION_POLL_INTERVAL_MS = 1000;
const MAX_CONCURRENCY = 2;

export function MailMutationOutboxManager() {
  useEffect(() => {
    removeLegacyMailActionQueue();
    const ownerId = crypto.randomUUID();
    let active = 0;
    let activeSyncs = 0;
    let stopped = false;
    let drainScheduled = false;
    let syncDrainScheduled = false;
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleWake = async () => {
      const wakeAt = await getNextMailMutationWakeAt();
      if (stopped || wakeAt === undefined) return;
      if (wakeTimer) clearTimeout(wakeTimer);
      wakeTimer = setTimeout(drainAll, Math.max(0, wakeAt - Date.now()));
    };

    const drain = () => {
      if (stopped || drainScheduled || !navigator.onLine) return;
      drainScheduled = true;
      queueMicrotask(async () => {
        drainScheduled = false;
        while (!stopped && active < MAX_CONCURRENCY && navigator.onLine) {
          const mutation = await claimNextMailMutation({
            leaseMs: LEASE_MS,
            ownerId,
          });
          if (!mutation) {
            scheduleWake().catch(() => {});
            break;
          }
          active += 1;
          processMutationWithLeaseHeartbeat(mutation, ownerId)
            .catch(() =>
              retryMutation(mutation, "Mutation request failed", ownerId),
            )
            .finally(() => {
              active -= 1;
              drain();
            });
        }
      });
    };
    const drainSyncGroups = () => {
      if (stopped || syncDrainScheduled || !navigator.onLine) return;
      syncDrainScheduled = true;
      queueMicrotask(async () => {
        syncDrainScheduled = false;
        while (!stopped && activeSyncs < MAX_CONCURRENCY && navigator.onLine) {
          const group = await claimNextMailMutationSyncGroup({
            leaseMs: LEASE_MS,
            ownerId,
          });
          if (!group) {
            scheduleWake().catch(() => {});
            break;
          }
          activeSyncs += 1;
          reconcileSyncGroupWithLeaseHeartbeat(group, ownerId)
            .catch(() => retrySyncGroup(group, ownerId))
            .finally(() => {
              activeSyncs -= 1;
              drainSyncGroups();
            });
        }
      });
    };
    const drainAll = () => {
      drain();
      drainSyncGroups();
    };
    const resumeAndDrain = () => {
      resumeBlockedMailMutations()
        .catch(() => {})
        .finally(drainAll);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resumeAndDrain();
    };
    const surfaceNotifications = async () => {
      let mutation = await claimNextMailMutationNotification();
      while (mutation) {
        toastError({
          description:
            mutation.status === "uncertain"
              ? "This reply may have sent. Check Sent before retrying."
              : (mutation.lastError ??
                "A queued mail action could not be completed."),
        });
        mutation = await claimNextMailMutationNotification();
      }
    };
    const onMutationChange = () => {
      if (wakeTimer) clearTimeout(wakeTimer);
      drainAll();
      surfaceNotifications().catch(() => {});
    };
    const unsubscribe = subscribeToMailMutations(onMutationChange);
    window.addEventListener("online", resumeAndDrain);
    window.addEventListener("focus", resumeAndDrain);
    document.addEventListener("visibilitychange", onVisibility);
    drainAll();
    surfaceNotifications().catch(() => {});

    return () => {
      stopped = true;
      if (wakeTimer) clearTimeout(wakeTimer);
      unsubscribe();
      window.removeEventListener("online", resumeAndDrain);
      window.removeEventListener("focus", resumeAndDrain);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}

async function processMutationWithLeaseHeartbeat(
  mutation: MailMutation,
  ownerId: string,
) {
  const heartbeat = setInterval(() => {
    renewMailMutationLease(mutation.id, { leaseMs: LEASE_MS, ownerId }).catch(
      () => {},
    );
  }, LEASE_MS / 2);
  try {
    await processMutation(mutation, ownerId);
  } finally {
    clearInterval(heartbeat);
  }
}

async function processMutation(mutation: MailMutation, ownerId: string) {
  if (isExpiredUnsyncedSnooze(mutation)) {
    await failMailMutation(
      mutation.id,
      "failed",
      "Snooze time has passed",
      ownerId,
    );
    return;
  }
  const request = withRequestTimeout(executeMutationRequest(mutation));
  const result =
    mutation.kind === "reply"
      ? await reconcileReplyRequest(mutation, request)
      : await request;
  if (!result) {
    await retryMutation(mutation, "Mutation request failed", ownerId);
    return;
  }
  switch (result.status) {
    case "applied":
    case "already_applied":
      if (mutation.kind === "reply") {
        await completeMailMutation(
          mutation.id,
          "result" in result ? result.result : undefined,
          ownerId,
        );
        requestMailboxSync(mutation.emailAccountId);
        return;
      }
      if (!isSnoozeReconciliation(result)) {
        await settleMailMutationInCache(mutation);
      }
      await markMailMutationAwaitingSync(
        mutation.id,
        "result" in result ? result.result : undefined,
        ownerId,
      );
      return;
    case "blocked_auth":
      await blockMailMutationForAuth(
        mutation.id,
        "Reconnect this account",
        ownerId,
      );
      return;
    case "uncertain":
      await failMailMutation(
        mutation.id,
        "uncertain",
        "Delivery outcome is unknown; check Sent before retrying.",
        ownerId,
      );
      return;
    case "rejected":
      await failMailMutation(mutation.id, "failed", result.error, ownerId);
      return;
    case "retry":
      await retryMutation(
        mutation,
        "Provider temporarily unavailable",
        ownerId,
      );
  }
}

async function reconcileSyncGroupWithLeaseHeartbeat(
  group: MailMutationSyncGroup,
  ownerId: string,
) {
  const heartbeat = setInterval(() => {
    renewMailMutationSyncGroupLease(group, {
      leaseMs: LEASE_MS,
      ownerId,
    }).catch(() => {});
  }, LEASE_MS / 2);
  try {
    await syncMailboxNow(group.emailAccountId);
    await completeMailMutationSyncGroup(group, ownerId);
  } finally {
    clearInterval(heartbeat);
  }
}

async function retrySyncGroup(group: MailMutationSyncGroup, ownerId: string) {
  const attempts = Math.max(
    1,
    ...group.mutations.map((mutation) => mutation.attempts),
  );
  const delay = Math.min(1000 * 2 ** Math.max(0, attempts - 1), 60_000);
  await retryMailMutationSyncGroup(
    group,
    {
      error: "Mailbox reconciliation failed",
      nextAttemptAt: Date.now() + delay,
    },
    ownerId,
  );
}

async function executeMutationRequest(mutation: MailMutation) {
  const response = await executeMailMutationAction(
    mutation.emailAccountId,
    toActionInput(mutation),
  );
  if (!response?.data) throw new Error("Mutation request failed");
  return response.data;
}

async function reconcileReplyRequest(
  mutation: Extract<MailMutation, { kind: "reply" }>,
  request: ReturnType<typeof executeMutationRequest>,
) {
  const controller = new AbortController();
  try {
    return await Promise.race([
      request,
      pollEmailSendOperation(mutation, controller.signal),
    ]);
  } finally {
    controller.abort();
  }
}

async function pollEmailSendOperation(
  mutation: Extract<MailMutation, { kind: "reply" }>,
  signal: AbortSignal,
): ReturnType<typeof executeMutationRequest> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch(
        `/api/email-send-operations/${encodeURIComponent(mutation.id)}`,
        {
          headers: { [EMAIL_ACCOUNT_HEADER]: mutation.emailAccountId },
        },
      );
      if (response.status === 401) return { status: "blocked_auth" };
      if (response.ok) {
        const operation = emailSendOperationResponse.safeParse(
          await response.json(),
        );
        if (operation.success) {
          if (operation.data.status === "sent") {
            return {
              status: "already_applied",
              result: operation.data.result,
            };
          }
          if (operation.data.status === "uncertain") {
            return { status: "uncertain" };
          }
        }
      }
    } catch {
      if (signal.aborted) break;
    }
    await waitForSendOperationPoll(signal);
  }
  throw new Error("Email send reconciliation timed out");
}

function waitForSendOperationPoll(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SEND_OPERATION_POLL_INTERVAL_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function retryMutation(
  mutation: MailMutation,
  error: string,
  ownerId: string,
) {
  const delay = Math.min(
    1000 * 2 ** Math.max(0, mutation.attempts - 1),
    60_000,
  );
  await retryMailMutation(
    mutation.id,
    {
      error,
      nextAttemptAt: Date.now() + delay,
    },
    ownerId,
  );
}

function toActionInput(mutation: MailMutation): ExecuteMailMutationBody {
  const base = {
    kind: mutation.kind,
    mutationId: mutation.id,
    threadId: mutation.threadId,
    messageIds: mutation.messageIds,
  };
  switch (mutation.kind) {
    case "archive":
      return { ...base, kind: mutation.kind, labelId: mutation.labelId };
    case "set_read_state":
      return { ...base, kind: mutation.kind, read: mutation.read };
    case "snooze":
      return {
        ...base,
        kind: mutation.kind,
        scheduledFor: mutation.scheduledFor,
      };
    case "cancel_snooze":
      return {
        ...base,
        kind: mutation.kind,
        snoozeMutationId: mutation.snoozeMutationId,
      };
    case "reply":
      return {
        ...base,
        kind: mutation.kind,
        email: mutation.email,
        queuedAt: mutation.createdAt,
      };
    default:
      return { ...base, kind: mutation.kind };
  }
}

function isSnoozeReconciliation(result: unknown) {
  if (!result || typeof result !== "object" || !("result" in result)) {
    return false;
  }
  const reconciliation = result.result;
  return (
    reconciliation !== null &&
    typeof reconciliation === "object" &&
    "reconciled" in reconciliation &&
    (reconciliation.reconciled === "snooze_expired" ||
      reconciliation.reconciled === "snooze_cancelled")
  );
}

async function withRequestTimeout<T>(request: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Mutation request timed out")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function removeLegacyMailActionQueue() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("gmailActionQueue");
  } catch {}
}
