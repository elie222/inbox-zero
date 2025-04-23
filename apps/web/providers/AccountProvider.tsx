"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import type { GetAccountsResponse } from "@/app/api/user/accounts/route";

type Account = GetAccountsResponse["accounts"][number];

type AccountContext = {
  account: Account | undefined;
  email: string;
  isLoading: boolean;
  setAccountId: (newId: string) => Promise<URLSearchParams>;
};

const AccountContext = createContext<AccountContext | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<GetAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accountId, setAccountId] = useQueryState("accountId");
  const [account, setAccount] = useState<Account | undefined>(undefined);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        // Not using SWR here because this will lead to a circular provider tree
        // This is the simplest fix
        const response = await fetch("/api/user/accounts");
        if (response.ok) {
          const accountData: GetAccountsResponse = await response.json();
          setData(accountData);
        }
      } catch (error) {
        console.error("Error fetching accounts:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAccounts();
  }, []);

  useEffect(() => {
    if (data?.accounts) {
      const currentAccount =
        data.accounts.find((acc) => acc.accountId === accountId) ??
        data.accounts[0];

      setAccount(currentAccount);
    }
  }, [data, accountId]);

  return (
    <AccountContext.Provider
      value={{ account, isLoading, setAccountId, email: account?.email || "" }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);

  if (context === undefined) {
    throw new Error("useAccount must be used within an AccountProvider");
  }

  return context;
}
