"use client";

import { useCallback, useEffect, use } from "react";
import useSWRInfinite from "swr/infinite";
import { useSetAtom } from "jotai";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/app/api/google/threads/validation";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import { refetchEmailListAtom } from "@/store/email";
import { BetaBanner } from "@/app/(app)/[emailAccountId]/mail/BetaBanner";
import { ClientOnly } from "@/components/ClientOnly";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";

export default function Mail(props: {
  searchParams: Promise<{ type?: string; labelId?: string }>;
}) {
  const searchParams = use(props.searchParams);
  const query: ThreadsQuery = {};

  // Handle different query params
  if (searchParams.type === "label" && searchParams.labelId) {
    query.labelId = searchParams.labelId;
  } else if (searchParams.type) {
    query.type = searchParams.type;
  }

  const getKey = (
    pageIndex: number,
    previousPageData: ThreadsResponse | null,
  ) => {
    if (previousPageData && !previousPageData.nextPageToken) return null;
    const queryParams = new URLSearchParams(query as Record<string, string>);
    // Append nextPageToken for subsequent pages
    if (pageIndex > 0 && previousPageData?.nextPageToken) {
      queryParams.set("nextPageToken", previousPageData.nextPageToken);
    }
    console.log("TEST LOG 22");
    return `/api/google/threads?${queryParams.toString()}`;
  };

  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsResponse>(getKey, {
      keepPreviousData: true,
      dedupingInterval: 1_000,
      revalidateOnFocus: false,
    });

  const allThreads = data ? data.flatMap((page) => page.threads) : [];
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const showLoadMore = data ? !!data[data.length - 1]?.nextPageToken : false;

  // store `refetch` in the atom so we can refresh the list upon archive via command k
  // TODO is this the best way to do this?
  const refetch = useCallback(
    (options?: { removedThreadIds?: string[] }) => {
      mutate(
        (currentData) => {
          if (!currentData) return currentData;
          if (!options?.removedThreadIds) return currentData;

          return currentData.map((page) => ({
            ...page,
            threads: page.threads.filter(
              (t) => !options?.removedThreadIds?.includes(t.id),
            ),
          }));
        },
        {
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
    },
    [mutate],
  );

  // Set up the refetch function in the atom store
  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

  const handleLoadMore = useCallback(() => {
    setSize((size) => size + 1);
  }, [setSize]);

  return (
    <>
      <PermissionsCheck />
      <ClientOnly>
        <BetaBanner />
      </ClientOnly>
      <LoadingContent loading={isLoading && !data} error={error}>
        {allThreads && (
          <List
            emails={allThreads}
            refetch={refetch}
            type={searchParams.type}
            showLoadMore={showLoadMore}
            handleLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
          />
        )}
      </LoadingContent>
    </>
  );
}
