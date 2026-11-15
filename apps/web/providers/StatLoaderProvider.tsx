"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { toastError, toastSuccess } from "@/components/Toast";
import { isError } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import { getRetryAfterDelayMs } from "@/utils/retry/provider-retry";

// Gmail's per-user quota is per minute, and a rate-limited load can report a
// much shorter Retry-After, so resuming sooner only hits the limit again.
const MIN_RATE_LIMIT_WAIT_MS = 60_000;
// Waiting this long without a single successful load means the provider is
// not recovering soon, so the import stops and the user can start it again.
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;

type Context = {
  isLoading: boolean;
  rateLimitResumeAt: Date | null;
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
  rateLimitResumeAt: null,
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
        if (response.status === 429) {
          throw new StatsRateLimitError(
            getRetryAfterDelayMs(
              response.headers.get("Retry-After") ?? undefined,
            ),
          );
        }
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
  const { t } = useLingui();
  const [loadingCounts, setLoadingCounts] = useState<Record<string, number>>(
    {},
  );
  const [rateLimitResumeAts, setRateLimitResumeAts] = useState<
    Record<string, Date | undefined>
  >({});
  // Cancelling aborts every batch started before it, including one that is
  // waiting out a rate limit; batches started afterwards get a fresh signal.
  const cancelControllerRef = useRef(new AbortController());
  const { emailAccountId } = useAccount();
  const rateLimitResumeAt = rateLimitResumeAts[emailAccountId] ?? null;
  const isLoading =
    Boolean(loadingCounts[emailAccountId]) || Boolean(rateLimitResumeAt);

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

  const waitForRateLimit = useCallback(
    async (resumeAt: Date, signal: AbortSignal) => {
      setRateLimitResumeAts((resumeAts) => ({
        ...resumeAts,
        [emailAccountId]: resumeAt,
      }));
      try {
        await sleepUnlessAborted(resumeAt.getTime() - Date.now(), signal);
      } finally {
        setRateLimitResumeAts((resumeAts) => ({
          ...resumeAts,
          [emailAccountId]: undefined,
        }));
      }
    },
    [emailAccountId],
  );

  const onLoadBatch = useCallback(
    async (options: { loadBefore: boolean; showToast: boolean }) => {
      const batchSize = 50;
      const { signal } = cancelControllerRef.current;
      let rateLimitedSince: number | null = null;
      try {
        for (let i = 0; i < batchSize; ) {
          if (signal.aborted) return;
          console.log("Loading batch", i);
          try {
            await onLoad({ ...options, showToast: false });
          } catch (error) {
            if (signal.aborted) return;
            if (!(error instanceof StatsRateLimitError)) throw error;

            const now = Date.now();
            rateLimitedSince ??= now;
            const resumeAt =
              now + Math.max(error.retryAfterMs ?? 0, MIN_RATE_LIMIT_WAIT_MS);
            if (resumeAt - rateLimitedSince > MAX_RATE_LIMIT_WAIT_MS)
              throw error;

            await waitForRateLimit(new Date(resumeAt), signal);
            continue;
          }
          rateLimitedSince = null;
          i++;
        }
        if (signal.aborted) return;
        if (options.showToast) toastSuccess({ description: "Stats loaded!" });
      } catch (error) {
        if (!options.showToast) return;
        toastError({
          description:
            error instanceof StatsRateLimitError
              ? t`Your email provider kept limiting requests, so loading stopped. Try again in a few minutes.`
              : "Error loading stats.",
        });
      }
    },
    [onLoad, waitForRateLimit, t],
  );

  const onCancelLoadBatch = useCallback(() => {
    cancelControllerRef.current.abort();
    cancelControllerRef.current = new AbortController();
  }, []);

  return (
    <StatLoaderContext.Provider
      value={{
        isLoading,
        rateLimitResumeAt,
        onLoad,
        onLoadBatch,
        onCancelLoadBatch,
      }}
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

function sleepUnlessAborted(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

class StatsRateLimitError extends Error {
  readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number) {
    super("Error loading stats.");
    this.name = "StatsRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}
