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
      id: string,
      expected: (row: ScheduledEmailRow) => ScheduledEmailRow | null,
      action: typeof cancelScheduledEmailAction,
    ) {
      await mutate(
        isAccountScheduledEmailsKey,
        (current?: { scheduledEmails: ScheduledEmailRow[] }) =>
          current && {
            ...current,
            scheduledEmails: current.scheduledEmails.flatMap((row) => {
              if (row.id !== id) return [row];
              const next = expected(row);
              return next ? [next] : [];
            }),
          },
        { revalidate: false },
      );
      try {
        const result = await action(emailAccountId, { id });
        if (result?.serverError || result?.validationErrors)
          throw new Error(getActionErrorMessage(result));
      } catch (error) {
        toastError({
          description:
            error instanceof Error
              ? error.message
              : "Could not update delivery.",
        });
      } finally {
        await mutate(isAccountScheduledEmailsKey).catch(() => {});
      }
    }

    return {
      cancelSend: (id: string) =>
        run(id, () => null, cancelScheduledEmailAction),
      retrySend: (id: string) =>
        run(
          id,
          (row) => ({
            ...row,
            status: "PENDING",
            // Retrying sends now.
            sendAt: new Date().toISOString(),
            error: null,
          }),
          retryScheduledEmailAction,
        ),
      cancelReminder: (id: string) =>
        run(
          id,
          (row) => ({ ...row, reminderStatus: "CANCELLED" }),
          cancelEmailReminderAction,
        ),
    };
  }, [emailAccountId, mutate]);
}
