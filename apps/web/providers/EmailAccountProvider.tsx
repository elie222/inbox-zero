"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { setLastEmailAccountAction } from "@/utils/actions/email-account-cookie";

type Context = {
  emailAccount: GetEmailAccountsResponse["emailAccounts"][number] | undefined;
  emailAccountId: string;
  userEmail: string;
  isLoading: boolean;
  provider: string;
  providerRateLimit:
    | GetEmailAccountsResponse["emailAccounts"][number]["providerRateLimit"]
    | null;
};

type EmailAccount = GetEmailAccountsResponse["emailAccounts"][number];

const EmailAccountContext = createContext<Context | undefined>(undefined);

const previewContextValue: Context = {
  emailAccount: undefined,
  emailAccountId: "",
  userEmail: "",
  isLoading: false,
  provider: "",
  providerRateLimit: null,
};

export function EmailAccountProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ emailAccountId: string | undefined }>();
  const emailAccountId = params.emailAccountId;
  const [data, setData] = useState<GetEmailAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastKnownEmailAccountId = data?.lastEmailAccountId ?? null;

  useEffect(() => {
    async function fetchAccounts() {
      try {
        // Not using SWR here because this will lead to a circular provider tree
        // This is the simplest fix
        const response = await fetch("/api/user/email-accounts");
        if (response.ok) {
          const result: GetEmailAccountsResponse = await response.json();
          setData(result);
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
    if (data && emailAccountId && emailAccountId !== lastKnownEmailAccountId) {
      setLastEmailAccountAction({ emailAccountId }).catch(() => {});
    }
  }, [data, emailAccountId, lastKnownEmailAccountId]);

  const emailAccount = useMemo(() => {
    if (data?.emailAccounts) {
      // Priority: URL param > last known from cookie > first account
      const currentEmailAccount =
        data.emailAccounts.find((acc) => acc.id === emailAccountId) ??
        data.emailAccounts.find((acc) => acc.id === lastKnownEmailAccountId) ??
        data.emailAccounts[0];

      return currentEmailAccount;
    }
  }, [data, emailAccountId, lastKnownEmailAccountId]);

  const resolvedEmailAccountId = emailAccountId ?? emailAccount?.id ?? "";

  return (
    <EmailAccountContext.Provider
      value={{
        emailAccount,
        isLoading,
        emailAccountId: resolvedEmailAccountId,
        userEmail: emailAccount?.email ?? "",
        provider: emailAccount?.account?.provider ?? "",
        providerRateLimit: emailAccount?.providerRateLimit ?? null,
      }}
    >
      {children}
    </EmailAccountContext.Provider>
  );
}

export function EmailAccountPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EmailAccountContext.Provider value={previewContextValue}>
      {children}
    </EmailAccountContext.Provider>
  );
}

/**
 * Temporarily scopes account-aware descendants without changing the route,
 * last-account cookie, or the app-wide SWR cache. This lets a combined inbox
 * reader operate as the row's owning account while the surrounding page stays
 * on All Accounts.
 */
export function EmailAccountScopeProvider({
  children,
  emailAccount,
}: {
  children: React.ReactNode;
  emailAccount?: EmailAccount;
}) {
  const parent = useAccount();
  const value = useMemo<Context>(
    () =>
      emailAccount
        ? {
            emailAccount,
            emailAccountId: emailAccount.id,
            userEmail: emailAccount.email,
            isLoading: false,
            provider: emailAccount.account.provider,
            providerRateLimit: emailAccount.providerRateLimit,
          }
        : parent,
    [emailAccount, parent],
  );

  return (
    <EmailAccountContext.Provider value={value}>
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
