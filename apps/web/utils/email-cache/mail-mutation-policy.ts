import type { MailMutation } from "@/utils/email-cache/mail-mutations";

export function isExpiredUnsyncedSnooze(
  mutation: MailMutation,
  now = Date.now(),
) {
  return (
    mutation.kind === "snooze" &&
    mutation.attempts === 1 &&
    new Date(mutation.scheduledFor).getTime() <= now
  );
}
