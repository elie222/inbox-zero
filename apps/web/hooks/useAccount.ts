import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { useAccounts } from "@/hooks/useAccounts";

export function useAccount() {
  const { data, isLoading } = useAccounts();
  const [accountId] = useQueryState("accountId");

  const account = useMemo(() => {
    return (
      data?.accounts.find((account) => account.accountId === accountId) ??
      data?.accounts[0]
    );
  }, [data, accountId]);

  return { account, isLoading };
}
