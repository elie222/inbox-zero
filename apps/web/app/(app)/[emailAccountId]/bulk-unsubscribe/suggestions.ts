import type { NewsletterStatus } from "@/generated/prisma/enums";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";

export const SUGGESTION_READ_RATE_THRESHOLD = 20;
// Require enough emails that a low read rate is signal, not noise
export const SUGGESTION_MIN_EMAILS = 3;

type UnsubscribeSuggestionItem = {
  value: number;
  readEmails: number;
  status?: NewsletterStatus | null;
  autoArchived?: unknown;
  unsubscribeLink?: string | null;
};

export function isUnsubscribeSuggestion(item: UnsubscribeSuggestionItem) {
  if (item.status || item.autoArchived) return false;
  if (item.value < SUGGESTION_MIN_EMAILS) return false;
  const readRate = (item.readEmails / item.value) * 100;
  return readRate < SUGGESTION_READ_RATE_THRESHOLD;
}

export function getUnsubscribeSuggestions<T extends UnsubscribeSuggestionItem>(
  items: T[],
  options?: { requireAutomaticUnsubscribeLink?: boolean },
): T[] {
  return items
    .filter(isUnsubscribeSuggestion)
    .filter(
      (item) =>
        !options?.requireAutomaticUnsubscribeLink ||
        hasAutomaticUnsubscribeLink(item),
    )
    .sort((a, b) => b.value - a.value);
}

export function hasAutomaticUnsubscribeLink(item: {
  unsubscribeLink?: string | null;
}) {
  return Boolean(
    getHttpUnsubscribeLink({ unsubscribeLink: item.unsubscribeLink }),
  );
}
