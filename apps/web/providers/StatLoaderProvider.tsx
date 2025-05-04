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
import { loadEmailStatsAction } from "@/utils/actions/stats";
import { useAccount } from "@/providers/EmailAccountProvider";

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
  #isLoading = false;

  async loadStats({
    emailAccountId,
    loadBefore,
    showToast,
  }: {
    emailAccountId: string;
    loadBefore: boolean;
    showToast: boolean;
  }) {
    if (this.#isLoading) return;

    this.#isLoading = true;

    const res = await loadEmailStatsAction(emailAccountId, { loadBefore });

    if (showToast) {
      if (isError(res)) {
        toastError({ description: "Error loading stats." });
      } else {
        toastSuccess({ description: "Stats loaded!" });
      }
    }

    this.#isLoading = false;
  }
}

const statLoader = new StatLoader();

export function StatLoaderProvider(props: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const { emailAccountId } = useAccount();

  const onLoad = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      setIsLoading(true);
      await statLoader.loadStats({
        emailAccountId,
        loadBefore: options.loadBefore,
        showToast: options.showToast,
      });
      setIsLoading(false);
    },
    [emailAccountId],
  );

  const onLoadBatch = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      const batchSize = 50;
      for (let i = 0; i < batchSize; i++) {
        if (stopLoading) break;
        console.log("Loading batch", i);
        await onLoad({
          ...options,
          showToast: options.showToast && i === batchSize - 1,
        });
      }
      setStopLoading(false);
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
    onLoad(props);
  }, [onLoad, props]);

  return null;
}
