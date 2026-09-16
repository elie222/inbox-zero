"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EmailLabels } from "@/providers/email-label-types";
import { useMailMutationOverlay } from "@/hooks/useMailMutationOverlay";
import {
  captureEmailCacheEpoch,
  isEmailCacheEpochCurrent,
} from "@/utils/email-cache/database";
import { subscribeToEmailCacheChanges } from "@/utils/email-cache/cache-events";
import type {
  LocalSearchRequest,
  LocalSearchResult,
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
    if (!worker || !isReadable) {
      unavailable();
      return;
    }
    const onMessage = (
      event: MessageEvent<{ id: number; result: LocalSearchResult }>,
    ) => {
      if (event.data.id !== id) return;
      clearTimeout(timeout);
      if (
        !accountIds.every((accountId, index) =>
          isEmailCacheEpochCurrent(accountId, epochs[index]),
        )
      ) {
        unavailable();
        return;
      }
      setSnapshot({ request, result: event.data.result });
    };
    const timeout = setTimeout(unavailable, 5000);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", unavailable);
    worker.postMessage({ id, request });
    return () => {
      clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", unavailable);
    };
  }, [enabled, request, isReady, isReadable, accountIds]);

  const result =
    enabled && snapshot?.request === request ? snapshot.result : undefined;
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
  return { threads, status: result?.status, online };
}
