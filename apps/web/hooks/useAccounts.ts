import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

export function useAccounts(enabled = true) {
  return useSWR<GetEmailAccountsResponse>(
    enabled ? "/api/user/email-accounts" : null,
    {
      revalidateOnFocus: false,
    },
  );
}
