import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import {
  EMAIL_ACCOUNTS_KEY,
  fetchEmailAccounts,
} from "@/utils/fetch-email-accounts";

export function useAccounts(enabled = true) {
  return useSWR<GetEmailAccountsResponse>(
    enabled ? EMAIL_ACCOUNTS_KEY : null,
    fetchEmailAccounts,
    {
      revalidateOnFocus: false,
    },
  );
}
