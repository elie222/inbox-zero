"use client";

import { useCallback, useState, createContext, useMemo } from "react";
import { SWRConfig, mutate } from "swr";
import { captureException } from "@/utils/error";

// https://swr.vercel.app/docs/error-handling#status-code-and-error-object
const fetcher = async (url: string, init?: RequestInit | undefined) => {
  const res = await fetch(url, init);

  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!res.ok) {
    const error: Error & { info?: any; status?: number } = new Error(
      "An error occurred while fetching the data.",
    );
    // Attach extra info to the error object.
    error.info = await res.json();
    error.status = res.status;

    captureException(error, {
      extra: { url, extraMessage: "SWR fetch error" },
    });

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

  const resetCache = useCallback(() => {
    // based on: https://swr.vercel.app/docs/mutation#mutate-multiple-items
    mutate(() => true, undefined, { revalidate: false });

    // not sure we also need this approach anymore to clear cache but keeping both for now
    setProvider(new Map());
  }, []);

  const value = useMemo(() => ({ resetCache }), [resetCache]);

  return (
    <SWRContext.Provider value={value}>
      <SWRConfig value={{ fetcher, provider: () => provider }}>
        {props.children}
      </SWRConfig>
    </SWRContext.Provider>
  );
};
