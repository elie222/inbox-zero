"use client";

import {
  useCallback,
  useState,
  createContext,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { SWRConfig, mutate } from "swr";
import { captureException } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { prefixPath } from "@/utils/path";
import { NO_REFRESH_TOKEN_ERROR_CODE } from "@/utils/config";

// https://swr.vercel.app/docs/error-handling#status-code-and-error-object
const fetcher = async (
  url: string,
  init?: RequestInit | undefined,
  emailAccountId?: string | null,
) => {
  const headers = new Headers(init?.headers);

  if (emailAccountId) {
    headers.set(EMAIL_ACCOUNT_HEADER, emailAccountId);
  }

  const newInit = { ...init, headers };

  const res = await fetch(url, newInit);

  if (!res.ok) {
    const errorData = await res.json();

    if (errorData.errorCode === NO_REFRESH_TOKEN_ERROR_CODE) {
      if (emailAccountId) {
        captureException(new Error("Refresh token missing"), {
          extra: {
            url,
            status: res.status,
            statusText: res.statusText,
            responseBody: errorData,
            emailAccountId,
          },
        });

        console.log("Refresh token missing, redirecting to consent page...");
        const redirectUrl = prefixPath(emailAccountId, "/permissions/consent");
        window.location.href = redirectUrl;
        return;
      }
    }

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
  const { emailAccountId } = useAccount();
  const previousEmailAccountIdRef = useRef<string | null>(null);

  const resetCache = useCallback(() => {
    // based on: https://swr.vercel.app/docs/mutation#mutate-multiple-items
    mutate(() => true, undefined, { revalidate: false });

    // not sure we also need this approach anymore to clear cache but keeping both for now
    setProvider(new Map());
  }, []);

  // Reset cache when emailAccountId changes (account switching)
  useEffect(() => {
    if (
      emailAccountId &&
      previousEmailAccountIdRef.current &&
      emailAccountId !== previousEmailAccountIdRef.current
    ) {
      resetCache();
    }
    previousEmailAccountIdRef.current = emailAccountId;
  }, [emailAccountId, resetCache]);

  const enhancedFetcher = useCallback(
    async (url: string, init?: RequestInit) => {
      return fetcher(url, init, emailAccountId);
    },
    [emailAccountId],
  );

  const value = useMemo(() => ({ resetCache }), [resetCache]);

  return (
    <SWRContext.Provider value={value}>
      <SWRConfig
        value={{
          fetcher: enhancedFetcher,
          provider: () => provider,
          // TODO: Send to Sentry
          onError: (error) => console.log("SWR error:", error),
        }}
      >
        {props.children}
      </SWRConfig>
    </SWRContext.Provider>
  );
};

export { SWRContext };
