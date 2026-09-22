"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";

export function SharedConversationList() {
  const [memberId, setMemberId] = useState("");
  const memberships = useSWR<TeamConversationsResponse>(
    "/api/team-comments/conversations",
  );
  const conversations = useSWR<TeamConversationsResponse>(
    memberId
      ? `/api/team-comments/conversations?memberId=${encodeURIComponent(memberId)}`
      : null,
  );
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-title text-2xl font-semibold">Shared with me</h1>
        {memberId && (
          <Link
            href={`/shared/activity?memberId=${encodeURIComponent(memberId)}`}
            className="text-primary text-sm underline"
          >
            Activity
          </Link>
        )}
      </div>
      <LoadingContent loading={memberships.isLoading} error={memberships.error}>
        <label className="block space-y-1 text-sm">
          Organization membership
          <select
            className="block w-full max-w-sm rounded border bg-background p-2"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
          >
            <option value="">Select an account and organization</option>
            {memberships.data?.memberships.map((membership) => (
              <option key={membership.id} value={membership.id}>
                {membership.organization.name} · {membership.emailAccount.email}
              </option>
            ))}
          </select>
        </label>
      </LoadingContent>
      {memberId && (
        <LoadingContent
          loading={conversations.isLoading}
          error={conversations.error}
        >
          <div className="space-y-2">
            {!conversations.data?.conversations.length && (
              <p className="text-muted-foreground text-sm">
                No shared conversations yet.
              </p>
            )}
            {conversations.data?.conversations.map((conversation) => (
              <Link
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent"
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
                {conversation.unread && (
                  <span className="rounded-full bg-primary px-2 py-1 text-primary-foreground text-xs">
                    Unread
                  </span>
                )}
              </Link>
            ))}
          </div>
        </LoadingContent>
      )}
    </main>
  );
}
