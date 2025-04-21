import useSWR from "swr";
import type { GetAccountsResponse } from "@/app/api/user/accounts/route";

export function useAccounts() {
  return useSWR<GetAccountsResponse>("/api/user/accounts", {
    revalidateOnFocus: false,
  });
}
