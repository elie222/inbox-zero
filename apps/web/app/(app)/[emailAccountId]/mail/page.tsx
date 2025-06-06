"use client";

import { useCallback, useEffect, use } from "react";
import useSWRInfinite from "swr/infinite";
import { useSetAtom } from "jotai";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/app/api/google/threads/validation";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import type { OutlookThreadsResponse } from "@/app/api/outlook/threads/controller";
import { refetchEmailListAtom } from "@/store/email";
import { BetaBanner } from "@/app/(app)/[emailAccountId]/mail/BetaBanner";
import { ClientOnly } from "@/components/ClientOnly";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";

// You may get this from props, context, or user/account info
// For this example, let's assume it's a prop:
export default function Mail(props: {
  searchParams: Promise<{
    type?: string;
    labelId?: string;
    folderId?: string;
    provider?: "gmail" | "outlook";
  }>;
}) {
  const searchParams = use(props.searchParams);
  const provider = searchParams.provider || "gmail"; // default to gmail if not set

  // Build the query object
  const query: ThreadsQuery = {};
  if (provider === "gmail") {
    if (searchParams.type === "label" && searchParams.labelId) {
      query.labelId = searchParams.labelId;
    } else if (searchParams.type) {
      query.type = searchParams.type;
    }
  } else if (provider === "outlook") {
    if (searchParams.type === "folder" && searchParams.folderId) {
      query.folderId = searchParams.folderId;
    } else if (searchParams.type) {
      query.type = searchParams.type;
    }
  }

  // Build the correct endpoint
  const endpoint =
    provider === "gmail" ? "/api/google/threads" : "/api/outlook/threads";

  // SWR key builder
  const getKey = (
    pageIndex: number,
    previousPageData: ThreadsResponse | OutlookThreadsResponse | null,
  ) => {
    if (previousPageData && !previousPageData.nextPageToken) return null;
    const queryParams = new URLSearchParams(query as Record<string, string>);
    if (pageIndex > 0 && previousPageData?.nextPageToken) {
      queryParams.set("nextPageToken", previousPageData.nextPageToken);
    }
    return `${endpoint}?${queryParams.toString()}`;
  };

  // Use correct response type for SWR
  const { data, size, setSize, isLoading, error, mutate } = useSWRInfinite<
    ThreadsResponse | OutlookThreadsResponse
  >(getKey, {
    keepPreviousData: true,
    dedupingInterval: 1_000,
    revalidateOnFocus: false,
  });

  const allThreads = data ? data.flatMap((page) => page.threads) : [];
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const showLoadMore = data ? !!data[data.length - 1]?.nextPageToken : false;

  // store `refetch` in the atom so we can refresh the list upon archive via command k
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

  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

  const handleLoadMore = useCallback(() => {
    setSize((size) => size + 1);
  }, [setSize]);

  return (
    <>
      {provider !== "outlook" && <PermissionsCheck />}
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
            provider={provider}
          />
        )}
      </LoadingContent>
    </>
  );
}
