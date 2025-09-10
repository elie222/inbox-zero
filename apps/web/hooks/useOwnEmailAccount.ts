import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

export function useOwnEmailAccount() {
  const { data, isLoading } = useSWR<GetEmailAccountsResponse>(
    "/api/user/email-accounts",
  );

  const ownEmailAccount = data?.emailAccounts?.find(
    (account) => account.isPrimary,
  );

  return {
    ownEmailAccountId: ownEmailAccount?.id,
    ownEmailAccount,
    isLoading,
  };
}
