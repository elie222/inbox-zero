import sumBy from "lodash/sumBy";
import { hasIncludedEmailAccountsStripePriceId } from "@/app/(app)/premium/config";

export function getStripeBillingQuantity({
  priceId,
  users,
}: {
  priceId: string | null | undefined;
  users: { _count: { emailAccounts: number } }[];
}): number {
  const totalSeats = hasIncludedEmailAccountsStripePriceId(priceId)
    ? sumBy(users, (user) =>
        user._count.emailAccounts <= 1
          ? user._count.emailAccounts
          : user._count.emailAccounts - 1,
      )
    : sumBy(users, (user) => user._count.emailAccounts);

  return Math.max(1, totalSeats);
}
