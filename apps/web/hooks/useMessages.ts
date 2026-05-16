import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import type { MessagesResponse } from "@/app/api/messages/route";

type MessagesOptions = {
  enabled?: boolean;
  searchQuery?: string | null;
};

type MessagesPageOptions = MessagesOptions & {
  pageToken?: string | null;
};

export function useMessages({
  enabled = true,
  searchQuery,
}: MessagesOptions = {}) {
  return useSWR<MessagesResponse>(
    enabled ? getMessagesUrl({ searchQuery }) : null,
  );
}

export function useInfiniteMessages(searchQuery?: string | null) {
  return useSWRInfinite<MessagesResponse>(
    (index, previousPageData) => {
      if (index === 0) return getMessagesUrl({ searchQuery });

      const pageToken = previousPageData?.nextPageToken;
      if (!pageToken) return null;

      return getMessagesUrl({ searchQuery, pageToken });
    },
    {
      revalidateFirstPage: false,
    },
  );
}

function getMessagesUrl({ searchQuery, pageToken }: MessagesPageOptions = {}) {
  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  if (pageToken) params.set("pageToken", pageToken);

  const paramsString = params.toString();
  return `/api/messages${paramsString ? `?${paramsString}` : ""}`;
}
