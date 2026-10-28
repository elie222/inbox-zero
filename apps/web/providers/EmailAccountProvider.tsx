"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { setLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { unownedAccountRedirectUrl } from "@/utils/account-switch-url";
import { ownedLastEmailAccountId } from "@/utils/cookies";
import {
  fetchEmailAccounts,
  subscribeEmailAccounts,
} from "@/utils/fetch-email-accounts";

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
  const router = useRouter();
  const [data, setData] = useState<GetEmailAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accountIds = data?.emailAccounts.map((account) => account.id) ?? [];
  const ownedRouteId = ownedLastEmailAccountId(
    emailAccountId ?? null,
    accountIds,
  );
  const lastKnownEmailAccountId = ownedLastEmailAccountId(
    data?.lastEmailAccountId ?? null,
    accountIds,
  );

  useEffect(() => {
    // This provider wraps SWRProvider, so it cannot useAccounts(). SWR mutate
    // still revalidates through fetchEmailAccounts, which notifies listeners.
    const unsubscribe = subscribeEmailAccounts(setData);
    fetchEmailAccounts()
      .then(setData)
      .catch((error) => {
        console.error("Error fetching accounts:", error);
      })
      .finally(() => setIsLoading(false));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (ownedRouteId && ownedRouteId !== lastKnownEmailAccountId) {
      setLastEmailAccountAction({ emailAccountId: ownedRouteId }).catch(
        () => {},
      );
    }
  }, [ownedRouteId, lastKnownEmailAccountId]);

  const emailAccount = useMemo(() => {
    if (!data?.emailAccounts.length) return;
    return (
      data.emailAccounts.find((account) => account.id === ownedRouteId) ??
      data.emailAccounts.find(
        (account) => account.id === lastKnownEmailAccountId,
      ) ??
      data.emailAccounts[0]
    );
  }, [data, ownedRouteId, lastKnownEmailAccountId]);

  useEffect(() => {
    if (!data) return;
    // Pathname is read here so this app-wide provider does not re-render on
    // every account-scoped navigation.
    const next = unownedAccountRedirectUrl({
      pathname: window.location.pathname,
      routeAccountId: emailAccountId,
      ownedRouteId,
      fallbackAccountId: emailAccount?.id,
      tab: null,
    });
    if (next) router.replace(next);
  }, [data, emailAccount?.id, emailAccountId, ownedRouteId, router]);

  const resolvedEmailAccountId =
    ownedRouteId ?? (data ? (emailAccount?.id ?? "") : (emailAccountId ?? ""));

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
