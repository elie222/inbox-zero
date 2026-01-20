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

  // Track the last known emailAccountId from URL params in this session.
  // This is needed because:
  // 1. The cookie update (setLastEmailAccountAction) is async
  // 2. The accounts fetch happens once on mount, before the cookie is updated
  // 3. When navigating to pages without emailAccountId (like /organization),
  //    we need to remember what account was last used in this session
  const [lastKnownEmailAccountId, setLastKnownEmailAccountId] = useState<
    string | null
  >(null);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        // Not using SWR here because this will lead to a circular provider tree
        // This is the simplest fix
        const response = await fetch("/api/user/email-accounts");
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

  // Update lastKnownEmailAccountId and cookie when emailAccountId from URL changes
  useEffect(() => {
    if (emailAccountId) {
      setLastKnownEmailAccountId(emailAccountId);
      setLastEmailAccountAction({ emailAccountId });
    }
  }, [emailAccountId]);

  const emailAccount = useMemo(() => {
    if (data?.emailAccounts) {
      // Priority: URL param > last known from this session > first account
      const currentEmailAccount =
        data.emailAccounts.find((acc) => acc.id === emailAccountId) ??
        data.emailAccounts.find((acc) => acc.id === lastKnownEmailAccountId) ??
        data.emailAccounts[0];

      return currentEmailAccount;
    }
  }, [data, emailAccountId, lastKnownEmailAccountId]);

  // Use emailAccount?.id as fallback when emailAccountId is not in URL params
  // This ensures consistency - e.g., on /organization pages where there's no emailAccountId in URL,
  // we still have a valid ID that matches the emailAccount object
  const resolvedEmailAccountId = emailAccountId ?? emailAccount?.id ?? "";

  return (
    <EmailAccountContext.Provider
      value={{
        emailAccount,
        isLoading,
        emailAccountId: resolvedEmailAccountId,
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
