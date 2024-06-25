"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import { useSetAtom } from "jotai";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/app/api/google/threads/validation";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import { refetchEmailListAtom } from "@/store/email";
import { BetaBanner } from "@/app/(app)/mail/BetaBanner";
import { ClientOnly } from "@/components/ClientOnly";

export default function Mail({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const query: ThreadsQuery = searchParams.type
    ? { type: searchParams.type }
    : {};

  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    `/api/google/threads?${new URLSearchParams(query as any).toString()}`,
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  const refetch = useCallback(
    (removedThreadIds?: string[]) => {
      mutate(undefined, {
        rollbackOnError: true,
        optimisticData: (currentData) => {
          if (!removedThreadIds)
            return {
              threads: currentData?.threads || [],
              nextPageToken: undefined,
            };
          const threads =
            currentData?.threads.filter(
              (t) => !removedThreadIds.includes(t.id),
            ) || [];
          return { threads, nextPageToken: undefined };
        },
        populateCache: (_, currentData) => {
          if (!removedThreadIds)
            return {
              threads: currentData?.threads || [],
              nextPageToken: undefined,
            };
          const threads =
            currentData?.threads.filter(
              (t) => !removedThreadIds.includes(t.id),
            ) || [];
          return { threads, nextPageToken: undefined };
        },
      });
    },
    [mutate],
  );

  // store `refetch` in the atom so we can refresh the list upon archive via command k
  // TODO is this the best way to do this?
  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

  return (
    <>
      <ClientOnly>
        <BetaBanner />
      </ClientOnly>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <List
            emails={data.threads}
            refetch={refetch}
            type={searchParams.type}
          />
        )}
      </LoadingContent>
    </>
  );
}
