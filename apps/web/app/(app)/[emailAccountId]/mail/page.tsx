"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import useSWRInfinite from "swr/infinite";
import { useSWRConfig } from "swr";
import { useSetAtom } from "jotai";
import { PenIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import { PinnedPage } from "@/components/PinnedPage";
import { Button } from "@/components/ui/button";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { useLabels } from "@/hooks/useLabels";
import { List } from "@/components/email-list/EmailList";
import { FolderSettings } from "@/components/FolderSettings";
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
        <MailControlBar
          type={searchParams.type}
          labelId={searchParams.labelId}
          searchInput={searchInput}
          onSearchInput={setSearchInput}
          onRefresh={() => mutate()}
          isRefreshing={!!isLoadingMore}
        />
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

const VIEW_TITLES: Record<string, string> = {
  inbox: "Inbox",
  draft: "Drafts",
  sent: "Sent",
  archive: "Archived",
};

// One bar across the top of the mail page: which folder you're in, search,
// refresh, and compose. The folder title used to live inside the list and the
// search in a strip of its own.
function MailControlBar({
  type,
  labelId,
  searchInput,
  onSearchInput,
  onRefresh,
  isRefreshing,
}: {
  type?: string;
  labelId?: string;
  searchInput: string;
  onSearchInput: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { onOpen: openCompose } = useComposeModal();
  const { userLabels } = useLabels();

  const isLabelView = type === "label" && !!labelId;
  const label = isLabelView
    ? userLabels.find((option) => option.id === labelId)
    : undefined;
  // Nested Gmail labels come through as "Parent/Child" — the bar shows the
  // leaf, same as the folder header it replaces
  const title = isLabelView
    ? (label?.name.split("/").pop() ?? "Folder")
    : (VIEW_TITLES[type ?? "inbox"] ?? "Inbox");

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight">{title}</h1>
      {isLabelView && labelId && <FolderSettings labelId={labelId} />}

      <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => onSearchInput(event.target.value)}
          placeholder="Search by name, email, or subject"
          className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
        />
        {searchInput && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          title="Refresh"
          disabled={isRefreshing}
          onClick={onRefresh}
        >
          <RefreshCwIcon className="size-4" />
          <span className="sr-only">Refresh</span>
        </Button>
        <Button size="sm" onClick={openCompose}>
          <PenIcon className="mr-1.5 size-3.5" />
          Compose
        </Button>
      </div>
    </div>
  );
}
