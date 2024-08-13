"use client";

import { useCallback, useEffect, useState } from "react";
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

  // States to handle more emails for the load more feature
  const [allThreads, setAllThreads] = useState(data?.threads || []);
  const [nextPageTokenId, setNextPageTokenId] = useState(data?.nextPageToken);
  const [isLoadMoreLoading, setIsLoadMoreLoading] = useState(false);

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

  useEffect(() => {
    if (data) {
      setAllThreads(data.threads);
      setNextPageTokenId(data.nextPageToken);
    }
  }, [data]);

  // Fetch new list of results based on nextPageToken when load more is clicked
  const handleLoadMoreThreads = async () => {
    if (!nextPageTokenId) return;
    setIsLoadMoreLoading(true);
    mutate(
      async (currentData) => {
        const res = await fetch(
          `/api/google/threads?nextPageToken=${nextPageTokenId}&${new URLSearchParams(
            query as any,
          ).toString()}`,
        );
        const newData: ThreadsResponse = await res.json();

        // update the threads and nextPageToken
        return {
          threads: [...(currentData?.threads || []), ...newData.threads],
          nextPageToken: newData.nextPageToken,
        };
      },
      { revalidate: false },
    ).finally(() => setIsLoadMoreLoading(false));
  };

  return (
    <>
      <ClientOnly>
        <BetaBanner />
      </ClientOnly>
      <LoadingContent loading={isLoading} error={error}>
        {allThreads && (
          <List
            emails={allThreads}
            refetch={refetch}
            type={searchParams.type}
            isLoadMore={nextPageTokenId ? true : false} // If nextPageToken doesn't exist then the button will be hidden
            handleLoadMoreThreads={handleLoadMoreThreads}
            isLoadMoreLoading={isLoadMoreLoading}
          />
        )}
      </LoadingContent>
    </>
  );
}
