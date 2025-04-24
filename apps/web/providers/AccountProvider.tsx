"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { GetAccountsResponse } from "@/app/api/user/accounts/route";

type Account = GetAccountsResponse["accounts"][number];

type Context = {
  account: Account | undefined;
  email: string;
  isLoading: boolean;
};

const AccountContext = createContext<Context | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ account: string | undefined }>();
  // TODO: throw an error if account is not defined?
  const accountId = params.account;
  const [data, setData] = useState<GetAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const account = useMemo(() => {
    if (data?.accounts) {
      const currentAccount =
        data.accounts.find((acc) => acc.accountId === accountId) ??
        data.accounts[0];

      return currentAccount;
    }
  }, [data, accountId]);

  return (
    <AccountContext.Provider
      value={{ account, isLoading, email: account?.email || "" }}
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
