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
import {
  EMAIL_ACCOUNT_HEADER,
  MICROSOFT_AUTH_EXPIRED_ERROR_CODE,
  NO_REFRESH_TOKEN_ERROR_CODE,
} from "@/utils/config";
import { prefixPath } from "@/utils/path";

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
    // Try to parse JSON, but handle cases where response isn't JSON (e.g. HMR 404s)
    let errorData: Record<string, unknown> = {};
    try {
      errorData = await res.json();
    } catch {
      // Response wasn't JSON - common during dev HMR, unexpected in production
      if (process.env.NODE_ENV !== "development") {
        console.error("Failed to parse error response as JSON", {
          url,
          status: res.status,
          statusText: res.statusText,
        });
      }
    }

    if (
      errorData.errorCode === NO_REFRESH_TOKEN_ERROR_CODE ||
      errorData.errorCode === MICROSOFT_AUTH_EXPIRED_ERROR_CODE
    ) {
      if (emailAccountId) {
        const errorMessage =
          errorData.errorCode === MICROSOFT_AUTH_EXPIRED_ERROR_CODE
            ? "Microsoft authorization expired"
            : "Refresh token missing";

        captureException(new Error(errorMessage), {
          extra: {
            url,
            status: res.status,
            statusText: res.statusText,
            responseBody: errorData,
            emailAccountId,
          },
        });

        console.log(`${errorMessage}, redirecting to consent page...`);
        const redirectUrl = prefixPath(emailAccountId, "/permissions/consent");
        window.location.href = redirectUrl;
        return;
      }
    }

    const errorMessage =
      (errorData.message as string) ||
      "An error occurred while fetching the data.";
    const error: Error & { info?: Record<string, unknown>; status?: number } =
      new Error(errorMessage);

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

export const SWRContext = createContext<Context>(defaultContextValue);

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
          onError: (error) => console.log("SWR error:", error),
          ...getDevOnlySWRConfig(),
        }}
      >
        {props.children}
      </SWRConfig>
    </SWRContext.Provider>
  );
};

// Dev-only config to handle transient 404s during HMR
function getDevOnlySWRConfig() {
  if (process.env.NODE_ENV !== "development") return {};

  return {
    keepPreviousData: true,
    onErrorRetry: (
      error: Error & { status?: number },
      _key: string,
      _config: unknown,
      revalidate: (opts: { retryCount: number }) => void,
      { retryCount }: { retryCount: number },
    ) => {
      // Retry 404s quickly (likely HMR transient errors)
      if (error.status === 404) {
        setTimeout(() => revalidate({ retryCount }), 500);
        return;
      }
      // Don't retry on other client errors (4xx)
      if (error.status && error.status >= 400 && error.status < 500) return;
      // Default exponential backoff for server errors
      setTimeout(() => revalidate({ retryCount }), 5000 * 2 ** retryCount);
    },
  };
}
