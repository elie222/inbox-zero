"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { LoadTinybirdEmailsResponse } from "@/app/api/user/stats/tinybird/load/route";
import type { LoadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";

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

  async loadStats(options: { loadBefore: boolean; showToast: boolean }) {
    if (this.#isLoading) return;

    this.#isLoading = true;

    const res = await postRequest<
      LoadTinybirdEmailsResponse,
      LoadTinybirdEmailsBody
    >("/api/user/stats/tinybird/load", {
      loadBefore: options.loadBefore,
    });

    if (options.showToast) {
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

  const onLoad = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      setIsLoading(true);
      await statLoader.loadStats(options);
      setIsLoading(false);
    },
    [],
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
