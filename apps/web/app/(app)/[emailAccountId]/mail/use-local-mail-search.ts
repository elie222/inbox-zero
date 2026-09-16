"use client";

import { searchPersistentMail } from "@/utils/email-cache/search-index-service";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailLabels } from "@/providers/email-label-types";
import { useMailMutationOverlay } from "@/hooks/useMailMutationOverlay";
import {
  captureEmailCacheEpoch,
  isEmailCacheEpochCurrent,
} from "@/utils/email-cache/database";
import { subscribeToEmailCacheChanges } from "@/utils/email-cache/cache-events";
import {
  getSearchMessageTimestamp,
  type LocalSearchRequest,
  type LocalSearchResult,
} from "@/utils/email-cache/search";
import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { ListThread } from "./types";

type SearchAccount = CombinedListThread["account"];

export function useLocalMailSearch({
  query,
  accounts,
  labelsByAccount,
  combined,
  enabled,
}: {
  query: string | null;
  accounts: SearchAccount[];
  labelsByAccount: Record<string, EmailLabels>;
  combined: boolean;
  enabled: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(true);
  const accountIds = useMemo(
    () => accounts.map((account) => account.id),
    [accounts],
  );
  const { mutations, isReady, isReadable } = useMailMutationOverlay({
    emailAccountIds: accountIds,
    enabled,
  });
  const searchAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        labels: Object.values(labelsByAccount[account.id] ?? {}).map(
          ({ id, name }) => ({ id, name }),
        ),
      })),
    [accounts, labelsByAccount],
  );
  const searchMutations = useMemo(
    () => mutations.filter((mutation) => mutation.kind !== "reply"),
    [mutations],
  );
  const request = useMemo(
    () => ({
      query: query ?? "",
      accounts: searchAccounts,
      mutations: searchMutations,
      revision,
    }),
    [query, searchAccounts, searchMutations, revision],
  );
  const [snapshot, setSnapshot] = useState<{
    request: LocalSearchRequest;
    result: LocalSearchResult;
  }>();
  const [loadingMoreFor, setLoadingMoreFor] = useState<LocalSearchRequest>();
  const moreRequest = useRef<LocalSearchRequest | undefined>(undefined);
  const workerRef = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return subscribeToEmailCacheChanges(({ emailAccountId }) => {
      if (!emailAccountId || accountIds.includes(emailAccountId))
        setRevision((value) => value + 1);
    });
  }, [accountIds, enabled]);

  useEffect(() => {
    try {
      // Load the worker while connected so a later offline search can use it.
      const worker = new Worker(
        new URL(
          "../../../../utils/email-cache/search.worker.ts",
          import.meta.url,
        ),
        { type: "module" },
      );
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = undefined;
      };
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !isReady) return;
    const worker = workerRef.current;
    const id = ++requestId.current;
    const epochs = accountIds.map((id) => captureEmailCacheEpoch(id));
    const unavailable = () =>
      setSnapshot({ request, result: { status: "unavailable", threads: [] } });
    if (!isReadable) {
      unavailable();
      return;
    }
    let active = true;
    const acceptResult = (responseId: number, result: LocalSearchResult) => {
      if (!active || responseId !== id) return;
      clearTimeout(timeout);
      if (
        !accountIds.every((accountId, index) =>
          isEmailCacheEpochCurrent(accountId, epochs[index]),
        )
      ) {
        unavailable();
        return;
      }
      setSnapshot({ request, result });
    };
    const onMessage = (
      event: MessageEvent<{ id: number; result: LocalSearchResult }>,
    ) => acceptResult(event.data.id, event.data.result);
    const timeout = setTimeout(unavailable, 5000);
    worker?.addEventListener("message", onMessage);
    worker?.addEventListener("error", unavailable);
    const fallback = () => {
      if (!active) return;
      if (worker) worker.postMessage({ id, request });
      else unavailable();
    };
    searchPersistentMail(request)
      .then((result) => {
        if (!active) return;
        if (result) acceptResult(id, result);
        else fallback();
      })
      .catch(fallback);
    return () => {
      active = false;
      if (moreRequest.current === request) moreRequest.current = undefined;
      clearTimeout(timeout);
      worker?.removeEventListener("message", onMessage);
      worker?.removeEventListener("error", unavailable);
    };
  }, [enabled, request, isReady, isReadable, accountIds]);

  const result =
    enabled && snapshot?.request === request ? snapshot.result : undefined;
  const loadMore = useCallback(async () => {
    if (!result?.cursors || moreRequest.current === request) return;
    moreRequest.current = request;
    setLoadingMoreFor(request);
    const epochs = accountIds.map((id) => captureEmailCacheEpoch(id));
    try {
      const page = await searchPersistentMail({
        ...request,
        cursors: result.cursors,
      });
      if (
        moreRequest.current !== request ||
        !page ||
        !accountIds.every((id, index) =>
          isEmailCacheEpochCurrent(id, epochs[index]),
        )
      )
        return;
      setSnapshot((current) => {
        if (current?.request !== request) return current;
        const merged = new Map(
          current.result.threads.map((item) => [
            JSON.stringify([item.emailAccountId, item.thread.id]),
            item,
          ]),
        );
        for (const item of page.threads)
          merged.set(
            JSON.stringify([item.emailAccountId, item.thread.id]),
            item,
          );
        return {
          request,
          result: {
            ...page,
            threads: [...merged.values()].sort(
              (a, b) =>
                getSearchMessageTimestamp(b.thread.messages.at(-1)) -
                  getSearchMessageTimestamp(a.thread.messages.at(-1)) ||
                a.emailAccountId.localeCompare(b.emailAccountId) ||
                a.thread.id.localeCompare(b.thread.id),
            ),
          },
        };
      });
    } catch {
      // Keep the current page and cursor available for retry.
    } finally {
      if (moreRequest.current === request) moreRequest.current = undefined;
      setLoadingMoreFor((current) =>
        current === request ? undefined : current,
      );
    }
  }, [result, request, accountIds]);
  const threads = useMemo<ListThread[]>(
    () =>
      (result?.threads ?? []).flatMap(({ emailAccountId, thread }) => {
        if (!combined) return [thread];
        const account = accounts.find(
          (account) => account.id === emailAccountId,
        );
        return account ? [{ ...thread, account }] : [];
      }),
    [accounts, combined, result],
  );
  return {
    threads,
    status: result?.status,
    coverage: result?.coverage,
    cursors: result?.cursors,
    hasMore: !!result?.cursors,
    loadMore,
    isLoadingMore: loadingMoreFor === request,
    online,
  };
}
