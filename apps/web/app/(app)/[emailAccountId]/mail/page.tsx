"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import useSWRInfinite from "swr/infinite";
import { useSWRConfig } from "swr";
import { useSetAtom } from "jotai";
import { SearchIcon, XIcon } from "lucide-react";
import { PinnedPage } from "@/components/PinnedPage";
import { List } from "@/components/email-list/EmailList";
import { EmailListSkeleton } from "@/components/email-list/EmailListSkeleton";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { refetchEmailListAtom } from "@/store/email";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { createSearchParams } from "@/utils/url";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useInboxStream } from "@/hooks/useInboxStream";
import { ContactPeekProvider } from "./ContactPeek";

export default function Mail(props: {
  searchParams: Promise<{ type?: string; labelId?: string; q?: string }>;
}) {
  const searchParams = use(props.searchParams);

  const [searchInput, setSearchInput] = useState(searchParams.q ?? "");
  const [searchQuery, setSearchQuery] = useState(searchParams.q ?? "");

  // Debounce typing so we don't fire a request per keystroke
  useEffect(() => {
    const timeout = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Sync from the URL: switching folders clears any stale query (which would
  // silently filter the new folder), while arriving with ?q (e.g. from a
  // contact's "Search in Mail") seeds the search
  // biome-ignore lint/correctness/useExhaustiveDependencies: folder changes must also reset the search
  useEffect(() => {
    setSearchInput(searchParams.q ?? "");
    setSearchQuery(searchParams.q ?? "");
  }, [searchParams.type, searchParams.labelId, searchParams.q]);

  const getKey = (
    pageIndex: number,
    previousPageData: ThreadsResponse | null,
  ) => {
    if (previousPageData && !previousPageData.nextPageToken) return null;

    const query: ThreadsQuery = {};

    // Search spans all mail — keeping the folder filter would hide matches
    // that were archived or filed elsewhere
    if (searchQuery) {
      query.q = searchQuery;
    } else if (searchParams.type === "label" && searchParams.labelId) {
      query.labelId = searchParams.labelId;
    } else if (searchParams.type) {
      query.type = searchParams.type;
    }

    // Append nextPageToken for subsequent pages
    if (pageIndex > 0 && previousPageData?.nextPageToken) {
      query.nextPageToken = previousPageData.nextPageToken;
    }
    const queryParams = createSearchParams(query);

    return `/api/threads?${queryParams.toString()}`;
  };

  // No keepPreviousData: switching folders should show a loader rather than
  // the previous folder's emails; revisited folders load instantly from cache.
  // Focus revalidation + a 30s poll of the first page keep new mail appearing
  // without a manual reload.
  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsResponse>(getKey, {
      dedupingInterval: 1000,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      refreshInterval: 30_000,
    });

  const allThreads = data ? data.flatMap((page) => page.threads) : [];
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const showLoadMore = data ? !!data[data.length - 1]?.nextPageToken : false;

  // store `refetch` in the atom so we can refresh the list upon archive via command k
  // TODO is this the best way to do this?
  const refetch = useCallback(
    (options?: { removedThreadIds?: string[] }) => {
      // Without removedThreadIds there is nothing to optimistically update;
      // revalidate so changes like undo actually show up.
      if (!options?.removedThreadIds) {
        mutate();
        return;
      }

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

  // Live updates: refresh instantly when the server reports new inbox mail.
  // The 30s poll stays as the fallback when the stream isn't available.
  const { emailAccountId } = useAccount();
  const { mutate: globalMutate } = useSWRConfig();
  const lastLiveRefreshRef = useRef(0);
  useInboxStream({
    emailAccountId,
    onNewMail: useCallback(() => {
      // A burst of webhook events shouldn't trigger a request per event
      if (Date.now() - lastLiveRefreshRef.current < 3000) return;
      lastLiveRefreshRef.current = Date.now();
      mutate();
      globalMutate("/api/labels/counts");
    }, [mutate, globalMutate]),
  });

  const handleLoadMore = useCallback(() => {
    setSize((size) => size + 1);
  }, [setSize]);

  return (
    <PinnedPage>
      <ContactPeekProvider>
        <PermissionsCheck />
        <div className="relative border-b border-border px-4 py-1.5">
          <SearchIcon className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, email, or subject"
            className="h-8 w-full rounded-md border-0 bg-muted pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchInput("")}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <LoadingContent
          loading={isLoading && !data}
          error={error}
          loadingComponent={<EmailListSkeleton />}
        >
          {allThreads && (
            <List
              emails={allThreads}
              refetch={refetch}
              type={searchParams.type}
              labelId={searchParams.labelId}
              searchQuery={searchQuery}
              showLoadMore={showLoadMore}
              handleLoadMore={handleLoadMore}
              isLoadingMore={isLoadingMore}
            />
          )}
        </LoadingContent>
      </ContactPeekProvider>
    </PinnedPage>
  );
}
