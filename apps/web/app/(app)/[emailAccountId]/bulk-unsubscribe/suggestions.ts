import type { NewsletterStatus } from "@/generated/prisma/enums";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";

export const SUGGESTION_READ_RATE_THRESHOLD = 15;
// Require enough emails that a low read rate is signal, not noise
export const SUGGESTION_MIN_EMAILS = 10;
// A long list of suggestions is overwhelming rather than actionable
export const SUGGESTION_LIMIT = 20;

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

/**
 * The number of emails from this sender the user never opened. Ranking by this
 * weights volume and read rate together, so a sender that floods the inbox
 * outranks a rarely-read sender that only sends occasionally.
 */
function getIgnoredEmails(item: UnsubscribeSuggestionItem) {
  return item.value - item.readEmails;
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
    .sort((a, b) => getIgnoredEmails(b) - getIgnoredEmails(a))
    .slice(0, SUGGESTION_LIMIT);
}

export function hasAutomaticUnsubscribeLink(item: {
  unsubscribeLink?: string | null;
}) {
  return Boolean(
    getHttpUnsubscribeLink({ unsubscribeLink: item.unsubscribeLink }),
  );
}
