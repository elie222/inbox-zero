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
import { mailMutationReceiptResponse } from "@/utils/email-cache/mail-mutation-receipt";
import { isExpiredUnsyncedSnooze } from "@/utils/email-cache/mail-mutation-policy";
import { settleMailMutationInCache } from "@/utils/email-cache/mail-mutation-settlement";
import {
  blockMailMutationForAuth,
  claimNextMailMutationNotification,
  claimNextMailMutation,
  completeMailMutation,
  failMailMutation,
  getNextMailMutationWakeAt,
  type MailMutation,
  renewMailMutationLease,
  resumeBlockedMailMutations,
  retryMailMutation,
  subscribeToMailMutations,
} from "@/utils/email-cache/mail-mutations";

const REQUEST_TIMEOUT_MS = 20 * 1000;
const LEASE_MS = 30 * 1000;
const RECEIPT_POLL_INTERVAL_MS = 1000;
const MAX_CONCURRENCY = 2;

export function MailMutationOutboxManager() {
  useEffect(() => {
    const ownerId = crypto.randomUUID();
    let active = 0;
    let stopped = false;
    let drainScheduled = false;
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleWake = async () => {
      const wakeAt = await getNextMailMutationWakeAt();
      if (stopped || wakeAt === undefined) return;
      if (wakeTimer) clearTimeout(wakeTimer);
      wakeTimer = setTimeout(drain, Math.max(0, wakeAt - Date.now()));
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
            .catch(() => retryMutation(mutation, "Mutation request failed"))
            .finally(() => {
              active -= 1;
              drain();
            });
        }
      });
    };
    const resumeAndDrain = () => {
      resumeBlockedMailMutations()
        .catch(() => {})
        .finally(drain);
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
      drain();
      surfaceNotifications().catch(() => {});
    };
    const unsubscribe = subscribeToMailMutations(onMutationChange);
    window.addEventListener("online", resumeAndDrain);
    window.addEventListener("focus", resumeAndDrain);
    document.addEventListener("visibilitychange", onVisibility);
    drain();
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
    await processMutation(mutation);
  } finally {
    clearInterval(heartbeat);
  }
}

async function processMutation(mutation: MailMutation) {
  if (isExpiredUnsyncedSnooze(mutation)) {
    await failMailMutation(mutation.id, "failed", "Snooze time has passed");
    return;
  }
  const request = withRequestTimeout(executeMutationRequest(mutation));
  const result =
    mutation.kind === "reply"
      ? await reconcileReplyRequest(mutation, request)
      : await request;
  if (!result) {
    await retryMutation(mutation, "Mutation request failed");
    return;
  }
  switch (result.status) {
    case "applied":
    case "already_applied":
      if (mutation.kind === "reply") {
        await completeMailMutation(
          mutation.id,
          "result" in result ? result.result : undefined,
        );
        requestMailboxSync(mutation.emailAccountId);
        return;
      }
      if (!isSnoozeReconciliation(result)) {
        await settleMailMutationInCache(mutation);
      }
      try {
        await syncMailboxNow(mutation.emailAccountId);
      } catch {
        await retryMutation(mutation, "Mailbox reconciliation failed");
        return;
      }
      await completeMailMutation(
        mutation.id,
        "result" in result ? result.result : undefined,
      );
      return;
    case "blocked_auth":
      await blockMailMutationForAuth(mutation.id, "Reconnect this account");
      return;
    case "uncertain":
      await failMailMutation(
        mutation.id,
        "uncertain",
        "Delivery outcome is unknown; check Sent before retrying.",
      );
      return;
    case "rejected":
      await failMailMutation(mutation.id, "failed", result.error);
      return;
    case "retry":
      await retryMutation(mutation, "Provider temporarily unavailable");
  }
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
      pollReplyReceipt(mutation, controller.signal),
    ]);
  } finally {
    controller.abort();
  }
}

async function pollReplyReceipt(
  mutation: Extract<MailMutation, { kind: "reply" }>,
  signal: AbortSignal,
): ReturnType<typeof executeMutationRequest> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch(
        `/api/mail-mutation-receipts/${encodeURIComponent(mutation.id)}`,
        {
          headers: { [EMAIL_ACCOUNT_HEADER]: mutation.emailAccountId },
        },
      );
      if (response.status === 401) return { status: "blocked_auth" };
      if (response.ok) {
        const receipt = mailMutationReceiptResponse.safeParse(
          await response.json(),
        );
        if (receipt.success) {
          if (receipt.data.status === "applied") {
            return {
              status: "already_applied",
              result: receipt.data.result,
            };
          }
          if (receipt.data.status === "uncertain") {
            return { status: "uncertain" };
          }
        }
      }
    } catch {
      if (signal.aborted) break;
    }
    await waitForReceiptPoll(signal);
  }
  throw new Error("Reply receipt reconciliation timed out");
}

function waitForReceiptPoll(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS);
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

async function retryMutation(mutation: MailMutation, error: string) {
  const delay = Math.min(
    1000 * 2 ** Math.max(0, mutation.attempts - 1),
    60_000,
  );
  await retryMailMutation(mutation.id, {
    error,
    nextAttemptAt: Date.now() + delay,
  });
}

function toActionInput(mutation: MailMutation): ExecuteMailMutationBody {
  const base = {
    kind: mutation.kind,
    mutationId: mutation.id,
    threadId: mutation.threadId,
    messageIds: mutation.messageIds,
  };
  switch (mutation.kind) {
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
      return { ...base, kind: mutation.kind, email: mutation.email };
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
