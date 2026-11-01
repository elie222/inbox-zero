"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toastError, toastSuccess } from "@/components/Toast";
import { isError } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";

type Context = {
  isLoading: boolean;
  onLoad: (options: {
    loadBefore: boolean;
    showToast: boolean;
  }) => Promise<void>;
  onLoadBatch: (options: {
    loadBefore: boolean;
    showToast: boolean;
  }) => Promise<void>;
  onCancelLoadBatch: () => void;
};

const StatLoaderContext = createContext<Context>({
  isLoading: false,
  onLoad: async () => {},
  onLoadBatch: async () => {},
  onCancelLoadBatch: () => {},
});

export const useStatLoader = () => useContext(StatLoaderContext);

class StatLoader {
  readonly #inFlight = new Map<string, Promise<void>>();

  async loadStats({
    emailAccountId,
    loadBefore,
  }: {
    emailAccountId: string;
    loadBefore: boolean;
  }) {
    const key = `${emailAccountId}:${loadBefore}`;
    const existing = this.#inFlight.get(key);
    if (existing) return existing;

    // Reads use an independent request so they cannot queue ahead of UI saves.
    const request = fetchWithAccount({
      url: "/api/user/stats/load",
      emailAccountId,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadBefore }),
      },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || isError(result))
          throw new Error("Error loading stats.");
      })
      .finally(() => this.#inFlight.delete(key));
    this.#inFlight.set(key, request);
    return request;
  }
}

const statLoader = new StatLoader();

export function StatLoaderProvider(props: { children: React.ReactNode }) {
  const [loadingCounts, setLoadingCounts] = useState<Record<string, number>>(
    {},
  );
  const [stopLoading, setStopLoading] = useState(false);
  const { emailAccountId } = useAccount();
  const isLoading = Boolean(loadingCounts[emailAccountId]);

  const onLoad = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      setLoadingCounts((counts) => ({
        ...counts,
        [emailAccountId]: (counts[emailAccountId] || 0) + 1,
      }));
      try {
        await statLoader.loadStats({
          emailAccountId,
          loadBefore: options.loadBefore,
        });
        if (options.showToast) toastSuccess({ description: "Stats loaded!" });
      } catch (error) {
        if (options.showToast)
          toastError({ description: "Error loading stats." });
        throw error;
      } finally {
        setLoadingCounts((counts) => ({
          ...counts,
          [emailAccountId]: Math.max(0, (counts[emailAccountId] || 0) - 1),
        }));
      }
    },
    [emailAccountId],
  );

  const onLoadBatch = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      const batchSize = 50;
      try {
        for (let i = 0; i < batchSize; i++) {
          if (stopLoading) return;
          console.log("Loading batch", i);
          await onLoad({ ...options, showToast: false });
        }
        if (options.showToast) toastSuccess({ description: "Stats loaded!" });
      } catch {
        if (options.showToast)
          toastError({ description: "Error loading stats." });
      } finally {
        setStopLoading(false);
      }
    },
    [onLoad, stopLoading],
  );

  const onCancelLoadBatch = useCallback(() => {
    setStopLoading(true);
  }, []);

  return (
    <StatLoaderContext.Provider
      value={{ isLoading, onLoad, onLoadBatch, onCancelLoadBatch }}
    >
      {props.children}
    </StatLoaderContext.Provider>
  );
}

export function LoadStats(props: { loadBefore: boolean; showToast: boolean }) {
  const { onLoad } = useStatLoader();

  useEffect(() => {
    onLoad(props).catch(() => undefined);
  }, [onLoad, props]);

  return null;
}
