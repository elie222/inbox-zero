import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

export function useAccounts() {
  return useSWR<GetEmailAccountsResponse>("/api/user/email-accounts", {
    revalidateOnFocus: false,
  });
}
