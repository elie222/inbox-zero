import useSWRInfinite from "swr/infinite";
import type { MessagesResponse } from "@/app/api/messages/route";

type UseInfiniteMessagesOptions = {
  enabled?: boolean;
  searchQuery?: string | null;
};

export function useInfiniteMessages({
  enabled = true,
  searchQuery,
}: UseInfiniteMessagesOptions = {}) {
  return useSWRInfinite<MessagesResponse>(
    (index, previousPageData) => {
      if (!enabled) return null;
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

function getMessagesUrl({
  searchQuery,
  pageToken,
}: {
  searchQuery?: string | null;
  pageToken?: string | null;
} = {}) {
  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  if (pageToken) params.set("pageToken", pageToken);

  const paramsString = params.toString();
  return `/api/messages${paramsString ? `?${paramsString}` : ""}`;
}
