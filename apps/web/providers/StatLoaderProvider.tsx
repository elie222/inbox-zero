"use client";

import {
  LoadTinybirdEmailsBody,
  LoadTinybirdEmailsResponse,
} from "@/app/api/user/stats/tinybird/load/route";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { isError } from "lodash";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type Context = {
  isLoading: boolean;
  onLoad: (options: {
    loadBefore: boolean;
    showToast: boolean;
  }) => Promise<void>;
};

const StatLoaderContext = createContext<Context>({
  isLoading: false,
  onLoad: async () => {},
});

export const useStatLoader = () => useContext(StatLoaderContext);

export function StatLoaderProvider(props: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);

  // avoid infinite loops by avoiding passing `isLoading` as a dependency to `onLoad`
  const isLoadingRef = useRef(isLoading);

  // Update the ref whenever isLoading changes
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const onLoad = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      if (isLoadingRef.current) return;

      setIsLoading(true);

      const res = await postRequest<
        LoadTinybirdEmailsResponse,
        LoadTinybirdEmailsBody
      >("/api/user/stats/tinybird/load", {
        loadBefore: options.loadBefore,
      });

      if (options.showToast) {
        if (isError(res)) {
          toastError({ description: `Error loading stats.` });
        } else {
          toastSuccess({ description: `Stats loaded!` });
        }
      }

      setIsLoading(false);
    },
    [],
  );

  return (
    <StatLoaderContext.Provider value={{ isLoading, onLoad }}>
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
