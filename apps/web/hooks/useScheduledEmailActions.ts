"use client";

import { useMemo } from "react";
import { useSWRConfig } from "swr";
import { toastError } from "@/components/Toast";
import {
  cancelEmailReminderAction,
  cancelScheduledEmailAction,
  retryScheduledEmailAction,
} from "@/utils/actions/scheduled-email";
import { getActionErrorMessage } from "@/utils/error";

// The thread and upcoming lists hold different row shapes; both key rows by id.
type ScheduledEmailRow = { id: string };
type ScheduledEmailList = { scheduledEmails: ScheduledEmailRow[] };

const inFlight = new Set<string>();

/**
 * Scheduled sends live in our database, not the mailbox, so they skip the mail
 * engine. Each action still shows its result at once, in every list of the
 * account's scheduled emails (which also decides which drafts are hidden), and
 * the lists then reload from the server, which also undoes a refused change.
 */
export function useScheduledEmailActions(emailAccountId: string) {
  const { mutate } = useSWRConfig();
  return useMemo(() => {
    const isAccountScheduledEmailsKey = (key: unknown) =>
      Array.isArray(key) &&
      key[1] === emailAccountId &&
      typeof key[0] === "string" &&
      key[0].startsWith("/api/user/scheduled-emails");

    async function run(
      kind: "cancel" | "retry" | "cancelReminder",
      id: string,
      expected: (row: ScheduledEmailRow) => ScheduledEmailRow | null,
      action: typeof cancelScheduledEmailAction,
    ) {
      // A second click while the first is out would be refused by the server
      // and report an error for a change that succeeded. Different actions on
      // one row, like cancelling its reminder and then its send, still run.
      const requestKey = `${emailAccountId}:${id}:${kind}`;
      if (inFlight.has(requestKey)) return;
      inFlight.add(requestKey);
      const before = new Map<object, ScheduledEmailList>();
      await mutate(
        isAccountScheduledEmailsKey,
        (current?: ScheduledEmailList) => {
          if (!current) return current;
          const next = {
            ...current,
            scheduledEmails: current.scheduledEmails.flatMap((row) => {
              if (row.id !== id) return [row];
              const updated = expected(row);
              return updated ? [updated] : [];
            }),
          };
          before.set(next, current);
          return next;
        },
        { revalidate: false },
      );
      try {
        const result = await action(emailAccountId, { id });
        if (result?.serverError || result?.validationErrors)
          throw new Error(getActionErrorMessage(result));
      } catch (error) {
        // Put the lists back now rather than trusting the reload below, which
        // can fail too; a list changed since keeps its newer state.
        await mutate(
          isAccountScheduledEmailsKey,
          (current?: ScheduledEmailList) =>
            (current && before.get(current)) ?? current,
          { revalidate: false },
        );
        toastError({
          description:
            error instanceof Error
              ? error.message
              : "Could not update delivery.",
        });
      } finally {
        inFlight.delete(requestKey);
        // A reload while another action is still out would bring back what
        // that action hides, so only the last one to finish reloads.
        const othersInFlight = [...inFlight].some((key) =>
          key.startsWith(`${emailAccountId}:`),
        );
        if (!othersInFlight)
          await mutate(isAccountScheduledEmailsKey).catch(() => {});
      }
    }

    return {
      cancelSend: (id: string) =>
        run("cancel", id, () => null, cancelScheduledEmailAction),
      retrySend: (id: string) =>
        run(
          "retry",
          id,
          (row) => ({
            ...row,
            status: "PENDING",
            // The server queues a retry to go out immediately, so the row
            // shows as due now rather than at its original time.
            sendAt: new Date().toISOString(),
            error: null,
          }),
          retryScheduledEmailAction,
        ),
      cancelReminder: (id: string) =>
        run(
          "cancelReminder",
          id,
          (row) => ({ ...row, reminderStatus: "CANCELLED" }),
          cancelEmailReminderAction,
        ),
    };
  }, [emailAccountId, mutate]);
}
