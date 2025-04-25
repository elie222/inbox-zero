"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { GetEmailAccountsResponse } from "@/app/api/user/accounts/route";

type Account = GetEmailAccountsResponse["emailAccounts"][number];

type Context = {
  account: Account | undefined;
  email: string;
  isLoading: boolean;
};

const EmailAccountContext = createContext<Context | undefined>(undefined);

export function EmailAccountProvider({
  children,
}: { children: React.ReactNode }) {
  const params = useParams<{ account: string | undefined }>();
  // TODO: throw an error if account is not defined?
  const emailAccountId = params.account;
  const [data, setData] = useState<GetEmailAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        // Not using SWR here because this will lead to a circular provider tree
        // This is the simplest fix
        const response = await fetch("/api/user/accounts");
        if (response.ok) {
          const emailAccounts: GetEmailAccountsResponse = await response.json();
          setData(emailAccounts);
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
    if (data?.emailAccounts) {
      const currentAccount =
        data.emailAccounts.find((acc) => acc.id === emailAccountId) ??
        data.emailAccounts[0];

      return currentAccount;
    }
  }, [data, emailAccountId]);

  return (
    <EmailAccountContext.Provider
      value={{ account, isLoading, email: account?.email || "" }}
    >
      {children}
    </EmailAccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(EmailAccountContext);

  if (context === undefined) {
    throw new Error(
      "useEmailAccount must be used within an EmailAccountProvider",
    );
  }

  return context;
}
