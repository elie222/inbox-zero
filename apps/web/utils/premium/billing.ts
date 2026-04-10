import sumBy from "lodash/sumBy";
import { hasIncludedEmailAccountsStripePriceId } from "@/app/(app)/premium/config";
import { extractDomainFromEmail, PUBLIC_EMAIL_DOMAINS } from "@/utils/email";

const ADDITIONAL_CONSUMER_EMAIL_DOMAINS = new Set([
  "googlemail.com",
  "hotmail.com",
  "live.com",
  "mac.com",
  "msn.com",
  "proton.me",
  "ymail.com",
]);

export function getStripeBillingQuantity({
  priceId,
  users,
}: {
  priceId: string | null | undefined;
  users: { emailAccounts: { email: string }[] }[];
}): number {
  const totalSeats = hasIncludedEmailAccountsStripePriceId(priceId)
    ? sumBy(users, (user) => getBillableSeatsForUser(user.emailAccounts))
    : sumBy(users, (user) => user.emailAccounts.length);

  return Math.max(1, totalSeats);
}

function getBillableSeatsForUser(emailAccounts: { email: string }[]): number {
  if (emailAccounts.length <= 1) return emailAccounts.length;

  return hasConsumerEmailAccount(emailAccounts)
    ? emailAccounts.length - 1
    : emailAccounts.length;
}

function hasConsumerEmailAccount(emailAccounts: { email: string }[]): boolean {
  return emailAccounts.some((emailAccount) => {
    const domain = extractDomainFromEmail(emailAccount.email).toLowerCase();

    return (
      PUBLIC_EMAIL_DOMAINS.has(domain) ||
      ADDITIONAL_CONSUMER_EMAIL_DOMAINS.has(domain)
    );
  });
}
