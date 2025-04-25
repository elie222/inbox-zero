"use client";

import { useCallback, useState, createContext, useMemo } from "react";
import { SWRConfig, mutate } from "swr";
import { captureException } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

// https://swr.vercel.app/docs/error-handling#status-code-and-error-object
const fetcher = async (url: string, init?: RequestInit | undefined) => {
  // Super hacky, if we use streaming endpoints we should do this:
  // https://github.com/vercel/ai/issues/3214
  // if (url.startsWith("/api/ai/")) return [];

  const res = await fetch(url, init);

  if (!res.ok) {
    const errorData = await res.json();
    const errorMessage =
      errorData.message || "An error occurred while fetching the data.";
    const error: Error & { info?: any; status?: number } = new Error(
      errorMessage,
    );

    // Attach extra info to the error object.
    error.info = errorData;
    error.status = res.status;

    const isKnownError = errorData.isKnownError;

    if (!isKnownError) {
      captureException(error, {
        extra: {
          url,
          status: res.status,
          statusText: res.statusText,
          responseBody: error.info,
          extraMessage: "SWR fetch error",
        },
      });
    }

    throw error;
  }

  return res.json();
};

interface Context {
  resetCache: () => void;
}

const defaultContextValue = {
  resetCache: () => {},
};

const SWRContext = createContext<Context>(defaultContextValue);

export const SWRProvider = (props: { children: React.ReactNode }) => {
  const [provider, setProvider] = useState(new Map());
  const { account } = useAccount();

  const resetCache = useCallback(() => {
    // based on: https://swr.vercel.app/docs/mutation#mutate-multiple-items
    mutate(() => true, undefined, { revalidate: false });

    // not sure we also need this approach anymore to clear cache but keeping both for now
    setProvider(new Map());
  }, []);

  const enhancedFetcher = useCallback(
    async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      if (account?.accountId) {
        headers.set(EMAIL_ACCOUNT_HEADER, account.accountId);
      }

      const newInit = { ...init, headers };

      return fetcher(url, newInit);
    },
    [account?.accountId],
  );

  const value = useMemo(() => ({ resetCache }), [resetCache]);

  return (
    <SWRContext.Provider value={value}>
      <SWRConfig value={{ fetcher: enhancedFetcher, provider: () => provider }}>
        {props.children}
      </SWRConfig>
    </SWRContext.Provider>
  );
};

export { SWRContext };
