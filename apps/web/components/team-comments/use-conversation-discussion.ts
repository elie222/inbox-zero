"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import type { TeamConversationResponse } from "@/app/api/team-comments/conversations/[conversationId]/route";
import type { TeamCommentsResponse } from "@/app/api/team-comments/conversations/[conversationId]/comments/route";

export function useConversationDiscussion(
  memberId: string,
  conversationId: string,
) {
  const [revoked, setRevoked] = useState(false);
  const query = `memberId=${encodeURIComponent(memberId)}`;
  const summary = useSWR<TeamConversationResponse>(
    `/api/team-comments/conversations/${conversationId}?${query}`,
    { refreshInterval: 30_000 },
  );
  const generation = summary.data?.generation;
  const commentPages = useSWRInfinite<TeamCommentsResponse>(
    (index, previousPage) => {
      if (!generation || (index > 0 && !previousPage?.nextCursor)) return null;
      const beforeRevision = index > 0 ? previousPage?.nextCursor : undefined;
      return `/api/team-comments/conversations/${conversationId}/comments?${query}&generation=${generation}&limit=100${beforeRevision ? `&beforeRevision=${beforeRevision}` : ""}`;
    },
    { refreshInterval: 30_000 },
  );
  const comments = {
    ...commentPages,
    data: commentPages.data
      ? {
          comments: commentPages.data
            .toReversed()
            .flatMap((page) => page.comments),
          nextCursor: commentPages.data.at(-1)?.nextCursor ?? null,
        }
      : undefined,
  };

  useEffect(() => {
    setRevoked(false);
    if (!generation) return;
    const url = `/api/team-comments/stream?conversationId=${encodeURIComponent(conversationId)}&${query}`;
    const stream = new EventSource(url);
    const refresh = () => {
      summary.mutate();
      commentPages.mutate();
    };
    stream.addEventListener("change", refresh);
    stream.addEventListener("revoked", () => {
      setRevoked(true);
      summary.mutate(undefined, { revalidate: false });
      commentPages.mutate(undefined, { revalidate: false });
      stream.close();
    });
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      stream.close();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [conversationId, generation, query, summary.mutate, commentPages.mutate]);

  return {
    summary,
    comments,
    loadMoreComments: () => commentPages.setSize(commentPages.size + 1),
    revoked,
    refresh: () => {
      summary.mutate();
      commentPages.mutate();
    },
  };
}
