"use client";

import { useCallback, useEffect, use, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import { useSetAtom } from "jotai";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/app/api/google/threads/validation";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import { refetchEmailListAtom } from "@/store/email";
import { BetaBanner } from "@/app/(app)/mail/BetaBanner";
import { ClientOnly } from "@/components/ClientOnly";
import { PermissionsCheck } from "@/app/(app)/PermissionsCheck";
import { EmailPanel } from "@/components/email-list/EmailPanel";

export default function Mail({ params }: { params: { slug: string[] } }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const query: ThreadsQuery = {};

  // Parse the slug to determine the view type and thread ID
  const [mailType, threadId] = params.slug;
  const isThreadView = !!threadId;

  // Handle different query params
  if (mailType === "label" && searchParams.get("labelId")) {
    query.labelId = searchParams.get("labelId")!;
  } else {
    query.type = mailType;
  }

  const getKey = (
    pageIndex: number,
    previousPageData: ThreadsResponse | null,
  ) => {
    if (previousPageData && !previousPageData.nextPageToken) return null;
    const queryParams = new URLSearchParams();
    // Set query params
    Object.entries(query).forEach(([key, value]) => {
      if (value) queryParams.set(key, String(value));
    });
    // Append nextPageToken for subsequent pages
    if (pageIndex > 0 && previousPageData?.nextPageToken) {
      queryParams.set("nextPageToken", previousPageData.nextPageToken);
    }
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

  // Find the currently selected thread
  const selectedThread = useMemo(() => {
    if (!isThreadView || !allThreads || allThreads.length === 0) return null;
    return allThreads.find((thread) => thread.id === threadId);
  }, [allThreads, threadId, isThreadView]);

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

  // Set up the refetch function in the atom store
  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

  const handleLoadMore = useCallback(() => {
    setSize((size) => size + 1);
  }, [setSize]);

  const closePanel = useCallback(() => {
    router.push(`/mail/${mailType}`);
  }, [router, mailType]);

  // Functions for the EmailPanel component when in thread view
  const onPlanAiAction = useCallback(() => {
    // Implementation will be added
  }, []);

  const onArchive = useCallback(() => {
    // Implementation will be added
  }, []);

  const advanceToAdjacentThread = useCallback(() => {
    // Implementation will be added
  }, []);

  // Render the full EmailPanel if we're in thread view
  if (isThreadView && selectedThread) {
    return (
      <div className="h-full overflow-hidden">
        <PermissionsCheck />
        <ClientOnly>
          <BetaBanner />
        </ClientOnly>
        <LoadingContent loading={isLoading && !data} error={error}>
          {selectedThread && (
            <EmailPanel
              row={selectedThread}
              onPlanAiAction={onPlanAiAction}
              onArchive={onArchive}
              advanceToAdjacentThread={advanceToAdjacentThread}
              close={closePanel}
              executingPlan={false}
              rejectingPlan={false}
              executePlan={async () => {}}
              rejectPlan={async () => {}}
              refetch={refetch}
            />
          )}
        </LoadingContent>
      </div>
    );
  }

  // Otherwise render the email list
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
            type={mailType}
            showLoadMore={showLoadMore}
            handleLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
          />
        )}
      </LoadingContent>
    </>
  );
}
