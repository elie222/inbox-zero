import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/accounts/route";

export function useAccounts() {
  return useSWR<GetEmailAccountsResponse>("/api/user/accounts", {
    revalidateOnFocus: false,
  });
}
