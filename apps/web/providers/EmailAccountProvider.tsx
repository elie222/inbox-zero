"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

type Context = {
  emailAccount: GetEmailAccountsResponse["emailAccounts"][number] | undefined;
  emailAccountId: string;
  userEmail: string;
  isLoading: boolean;
  provider: string;
};

const EmailAccountContext = createContext<Context | undefined>(undefined);

export function EmailAccountProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ emailAccountId: string | undefined }>();
  const emailAccountId = params.emailAccountId;
  const [data, setData] = useState<GetEmailAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        // Not using SWR here because this will lead to a circular provider tree
        // This is the simplest fix
        const response = await fetch("/api/user/email-accounts");
        if (response.ok) {
          const emailAccounts: GetEmailAccountsResponse = await response.json();
          setData(emailAccounts);
        } else if (response.status === 401) {
          // User is not authenticated, don't make the API call
          setData(null);
        }
      } catch (error) {
        console.error("Error fetching accounts:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAccounts();
  }, []);

  const emailAccount = useMemo(() => {
    if (data?.emailAccounts) {
      const currentEmailAccount =
        data.emailAccounts.find((acc) => acc.id === emailAccountId) ??
        data.emailAccounts[0];

      return currentEmailAccount;
    }
  }, [data, emailAccountId]);

  return (
    <EmailAccountContext.Provider
      value={{
        emailAccount,
        isLoading,
        emailAccountId: emailAccountId ?? "",
        userEmail: emailAccount?.email ?? "",
        provider: emailAccount?.account?.provider ?? "",
      }}
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
