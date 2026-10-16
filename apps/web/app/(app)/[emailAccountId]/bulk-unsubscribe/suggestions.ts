import type { NewsletterStatus } from "@/generated/prisma/enums";
import {
  canonicalizeEmailAddress,
  extractDomainFromEmail,
} from "@/utils/email";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";

export const SUGGESTION_READ_RATE_THRESHOLD = 20;
// Require enough emails that a low read rate is signal, not noise
export const SUGGESTION_MIN_EMAILS = 3;

// Account security alerts are rarely opened, so they look like newsletters by
// read rate. Unsubscribing or auto-archiving them hides sign-in and recovery
// warnings, so they are never suggested.
// Domains only send account mail; providers whose domain also sends regular
// notifications are matched by exact address instead.
const ACCOUNT_SECURITY_SENDER_DOMAINS = new Set([
  "accounts.google.com",
  "accountprotection.microsoft.com",
  "id.apple.com",
]);
const ACCOUNT_SECURITY_SENDER_ADDRESSES = new Set([
  "noreply-accounts@google.com",
  "security@facebookmail.com",
  "security-noreply@linkedin.com",
]);

type UnsubscribeSuggestionItem = {
  /** Sender email address */
  name: string;
  value: number;
  readEmails: number;
  status?: NewsletterStatus | null;
  autoArchived?: unknown;
  unsubscribeLink?: string | null;
};

export function isUnsubscribeSuggestion(item: UnsubscribeSuggestionItem) {
  if (isAccountSecuritySender(item.name)) return false;
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

export function getSuggestedModeRows<T extends UnsubscribeSuggestionItem>(
  items: T[],
  selected: ReadonlyMap<string, boolean>,
): T[] {
  return items.filter(
    (item) => isUnsubscribeSuggestion(item) || selected.get(item.name),
  );
}

export function hasAutomaticUnsubscribeLink(item: {
  unsubscribeLink?: string | null;
}) {
  return Boolean(
    getHttpUnsubscribeLink({ unsubscribeLink: item.unsubscribeLink }),
  );
}

function isAccountSecuritySender(email: string) {
  const address = canonicalizeEmailAddress(email);
  if (ACCOUNT_SECURITY_SENDER_ADDRESSES.has(address)) return true;
  return ACCOUNT_SECURITY_SENDER_DOMAINS.has(extractDomainFromEmail(address));
}
