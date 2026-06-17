import { subDays } from "date-fns/subDays";
import { Frequency, type NewsletterStatus } from "@/generated/prisma/enums";
import { isUnsubscribeSuggestion } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import type { EmailFilter } from "@/utils/email/types";

export const INBOX_HEALTH_MIN_SUGGESTIONS = 5;
export const INBOX_HEALTH_MAX_LISTED_SENDERS = 10;
export const INBOX_HEALTH_INTERVAL_DAYS = 30;
export const INBOX_HEALTH_MIN_ACCOUNT_AGE_DAYS = 7;

export type InboxHealthSenderStats = {
  /** Sender email address */
  name: string;
  fromName: string;
  /** Number of emails received in the last 3 months */
  value: number;
  readEmails: number;
  autoArchived?: EmailFilter;
  status?: NewsletterStatus | null;
};

/**
 * Decides whether an inbox health email is worth sending and shapes its
 * content. Returns null when there are too few unsubscribe suggestions.
 */
export function getInboxHealthEmailData(senders: InboxHealthSenderStats[]) {
  const suggestions = senders
    .filter(isUnsubscribeSuggestion)
    .sort((a, b) => b.value - a.value);

  if (suggestions.length < INBOX_HEALTH_MIN_SUGGESTIONS) return null;

  const threeMonthTotal = suggestions.reduce(
    (sum, sender) => sum + sender.value,
    0,
  );

  return {
    suggestionCount: suggestions.length,
    yearlyEmailsAvoided: Math.round(threeMonthTotal * 4),
    senders: suggestions
      .slice(0, INBOX_HEALTH_MAX_LISTED_SENDERS)
      .map((sender) => ({
        name: sender.fromName || sender.name,
        email: sender.name,
        count: sender.value,
        readPercentage: Math.round((sender.readEmails / sender.value) * 100),
      })),
  };
}

export function getInboxHealthSkipReason({
  statsEmailFrequency,
  createdAt,
  lastInboxHealthEmailAt,
  now,
}: {
  statsEmailFrequency: Frequency;
  createdAt: Date;
  lastInboxHealthEmailAt: Date | null;
  now: Date;
}): string | null {
  if (statsEmailFrequency === Frequency.NEVER) {
    return "stats emails disabled";
  }
  if (createdAt > subDays(now, INBOX_HEALTH_MIN_ACCOUNT_AGE_DAYS)) {
    return `account younger than ${INBOX_HEALTH_MIN_ACCOUNT_AGE_DAYS} days`;
  }
  if (
    lastInboxHealthEmailAt &&
    lastInboxHealthEmailAt > subDays(now, INBOX_HEALTH_INTERVAL_DAYS)
  ) {
    return `sent within the last ${INBOX_HEALTH_INTERVAL_DAYS} days`;
  }
  return null;
}
