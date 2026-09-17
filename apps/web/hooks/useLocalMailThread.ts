import { useEffect, useMemo, useSyncExternalStore } from "react";
import useSWRInfinite from "swr/infinite";
import { captureEmailCacheEpoch } from "@/utils/email-cache/database";
import {
  readLocalMailThreadPage,
  keepLocalMailThreadOpen,
} from "@/utils/email-cache/local-mail-reader";
import { subscribeToEmailCacheChanges } from "@/utils/email-cache/cache-events";

type Page = Awaited<ReturnType<typeof readLocalMailThreadPage>>;

export function useLocalMailThread({
  emailAccountId,
  threadId,
  includeDrafts,
  enabled,
}: {
  emailAccountId: string;
  threadId: string | null;
  includeDrafts?: boolean;
  enabled: boolean;
}) {
  const epoch = useSyncExternalStore(
    subscribeToEmailCacheChanges,
    () =>
      enabled
        ? (JSON.stringify(captureEmailCacheEpoch(emailAccountId)) ??
          "unavailable")
        : "disabled",
    () => "disabled",
  );
  const result = useSWRInfinite<Page>(
    (index, previous: Page) => {
      if (!enabled || !threadId || (index && !previous?.next)) return null;
      return [
        "local-mail-reader",
        emailAccountId,
        threadId,
        includeDrafts ?? false,
        index ? previous?.generation : undefined,
        index ? previous?.next : undefined,
        epoch,
      ] as const;
    },
    ([, account, thread, drafts, generation, before]) =>
      readLocalMailThreadPage({
        emailAccountId: account,
        threadId: thread,
        includeDrafts: drafts,
        generation,
        before,
        protectWhileOpen: true,
      }),
    {
      revalidateOnFocus: false,
      revalidateFirstPage: false,
      keepPreviousData: false,
    },
  );
  const generation = result.data?.[0]?.generation;
  useEffect(() => {
    if (!enabled || !threadId || !generation) return;
    return keepLocalMailThreadOpen({ emailAccountId, threadId, generation });
  }, [emailAccountId, enabled, threadId, generation]);
  const { mutate } = result;
  useEffect(() => {
    if (!enabled || !threadId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToEmailCacheChanges((change) => {
      if (change.emailAccountId && change.emailAccountId !== emailAccountId)
        return;
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          mutate();
        }, 250);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [emailAccountId, enabled, mutate, threadId]);
  const messages = useMemo(() => {
    if (!enabled || !threadId) return [];
    const unique = new Map<string, NonNullable<Page>["messages"][number]>();
    const pages = result.data ?? [];
    const generation = pages[0]?.generation;
    for (const page of [...pages].reverse()) {
      if (page?.generation !== generation) continue;
      for (const entry of page?.messages ?? [])
        unique.set(entry.message.id, entry);
    }
    return [...unique.values()];
  }, [enabled, result.data, threadId]);
  return {
    messages,
    hasRetainedThread: Boolean(enabled && result.data?.[0]?.hasRetainedThread),
    isLoading: result.isLoading,
    isValidating: result.isValidating,
    hasMore: Boolean(result.data?.at(-1)?.next),
    loadMore: () => result.setSize((size) => size + 1),
  };
}
