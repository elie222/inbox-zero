import type { NewsletterStatus } from "@/generated/prisma/enums";

export const SUGGESTION_READ_RATE_THRESHOLD = 20;
// Require enough emails that a low read rate is signal, not noise
export const SUGGESTION_MIN_EMAILS = 3;

export function isUnsubscribeSuggestion(item: {
  value: number;
  readEmails: number;
  status?: NewsletterStatus | null;
  autoArchived?: unknown;
}): boolean {
  if (item.status || item.autoArchived) return false;
  if (item.value < SUGGESTION_MIN_EMAILS) return false;
  const readRate = (item.readEmails / item.value) * 100;
  return readRate < SUGGESTION_READ_RATE_THRESHOLD;
}

export function getUnsubscribeSuggestions<
  T extends Parameters<typeof isUnsubscribeSuggestion>[0],
>(items: T[]): T[] {
  return items
    .filter(isUnsubscribeSuggestion)
    .sort((a, b) => b.value - a.value);
}
