"use client";

import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/ui/badge";
import type { TeamActivityResponse } from "@/app/api/team-comments/activity/route";
import {
  NoOrganization,
  useSharedMemberId,
} from "@/app/(app)/shared/SharedTabs";

const ACTIVITY_LABELS: Record<
  TeamActivityResponse["items"][number]["kind"],
  string
> = {
  INVITED: "Conversation shared",
  MENTION: "You were mentioned",
  COMMENT: "New comment",
};

export function ConversationActivity() {
  const { memberId, memberships } = useSharedMemberId();
  const activity = useSWRInfinite<TeamActivityResponse>(
    (index, previousPage) => {
      if (!memberId || (index > 0 && !previousPage?.nextCursor)) return null;
      const cursor = previousPage?.nextCursor;
      const before = cursor
        ? `&beforeAt=${encodeURIComponent(new Date(cursor.createdAt).toISOString())}&beforeId=${encodeURIComponent(cursor.id)}`
        : "";
      return `/api/team-comments/activity?memberId=${encodeURIComponent(memberId)}&limit=50${before}`;
    },
    { refreshInterval: 30_000, keepPreviousData: false },
  );
  const items = activity.data?.flatMap((page) => page.items) ?? [];
  const nextCursor = activity.data?.at(-1)?.nextCursor;
  return (
    <LoadingContent loading={memberships.isLoading} error={memberships.error}>
      {memberships.data && !memberId && <NoOrganization />}
      {memberId && (
        <LoadingContent
          loading={activity.isLoading}
          error={activity.data ? undefined : activity.error}
        >
          <div className="space-y-2">
            {!items.length && (
              <p className="text-muted-foreground text-sm">No activity yet.</p>
            )}
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/shared/${item.conversationId}?memberId=${encodeURIComponent(memberId)}`}
                className="block rounded-lg border bg-card p-3 hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium text-sm">
                    {ACTIVITY_LABELS[item.kind]}
                    {item.unread && <Badge>Unread</Badge>}
                  </span>
                  <time className="shrink-0 text-muted-foreground text-xs">
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </div>
                {item.preview && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                    {item.preview}
                  </p>
                )}
              </Link>
            ))}
            {activity.error ? (
              <div className="flex items-center gap-2" role="alert">
                <p className="text-destructive text-sm">
                  Could not load activity.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => activity.mutate()}
                >
                  Retry
                </Button>
              </div>
            ) : (
              nextCursor && (
                <Button
                  variant="outline"
                  onClick={() => activity.setSize(activity.size + 1)}
                >
                  Load older activity
                </Button>
              )
            )}
          </div>
        </LoadingContent>
      )}
    </LoadingContent>
  );
}
