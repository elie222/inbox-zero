"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import type { TeamActivityResponse } from "@/app/api/team-comments/activity/route";

export function ConversationActivity() {
  const memberId = useSearchParams().get("memberId");
  const activity = useSWRInfinite<TeamActivityResponse>(
    (index, previousPage) => {
      if (!memberId || (index > 0 && !previousPage?.nextCursor)) return null;
      const cursor = previousPage?.nextCursor;
      const before = cursor
        ? `&beforeAt=${encodeURIComponent(new Date(cursor.createdAt).toISOString())}&beforeId=${encodeURIComponent(cursor.id)}`
        : "";
      return `/api/team-comments/activity?memberId=${encodeURIComponent(memberId)}&limit=50${before}`;
    },
    { refreshInterval: 30_000 },
  );
  const items = activity.data?.flatMap((page) => page.items) ?? [];
  const nextCursor = activity.data?.at(-1)?.nextCursor;
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <Link href="/shared" className="text-primary text-sm underline">
        Shared with me
      </Link>
      <h1 className="font-title text-2xl font-semibold">Activity</h1>
      {!memberId && (
        <p>Select a membership from Shared with me to see activity.</p>
      )}
      {memberId && (
        <LoadingContent loading={activity.isLoading} error={activity.error}>
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
                <span className="font-medium text-sm">
                  {item.kind === "INVITED"
                    ? "Conversation shared"
                    : item.kind === "MENTION"
                      ? "You were mentioned"
                      : "New comment"}
                </span>
                {item.unread && (
                  <span className="ml-2 rounded bg-primary px-1 text-primary-foreground text-xs">
                    Unread
                  </span>
                )}
                {item.preview && (
                  <p className="line-clamp-2 text-muted-foreground text-sm">
                    {item.preview}
                  </p>
                )}
                <time className="text-muted-foreground text-xs">
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </Link>
            ))}
            {nextCursor && (
              <Button
                variant="outline"
                onClick={() => activity.setSize(activity.size + 1)}
              >
                Load older activity
              </Button>
            )}
          </div>
        </LoadingContent>
      )}
    </main>
  );
}
