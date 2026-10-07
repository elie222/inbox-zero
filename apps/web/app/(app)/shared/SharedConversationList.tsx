"use client";

import Link from "next/link";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/ui/badge";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";
import {
  NoOrganization,
  useSharedMemberId,
} from "@/app/(app)/shared/SharedTabs";

export function SharedConversationList() {
  const { memberId, memberships } = useSharedMemberId();
  const conversations = useSWR<TeamConversationsResponse>(
    memberId
      ? `/api/team-comments/conversations?memberId=${encodeURIComponent(memberId)}`
      : null,
    { refreshInterval: 30_000 },
  );
  return (
    <LoadingContent
      loading={memberships.isLoading || conversations.isLoading}
      error={memberships.error || conversations.error}
    >
      {memberships.data && !memberId && <NoOrganization />}
      {memberId && (
        <div className="space-y-2">
          {!conversations.data?.conversations.length && (
            <p className="text-muted-foreground text-sm">
              No shared conversations yet.
            </p>
          )}
          {conversations.data?.conversations.map((conversation) => (
            <Link
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-accent"
              key={conversation.id}
              href={`/shared/${conversation.id}?memberId=${encodeURIComponent(memberId)}`}
            >
              <span>
                <span className="block font-medium">
                  Conversation shared by {conversation.publisher}
                </span>
                <span className="text-muted-foreground text-xs">
                  {conversation.commentCount} comments ·{" "}
                  {new Date(conversation.updatedAt).toLocaleString()}
                </span>
              </span>
              {conversation.unread && <Badge>Unread</Badge>}
            </Link>
          ))}
        </div>
      )}
    </LoadingContent>
  );
}
