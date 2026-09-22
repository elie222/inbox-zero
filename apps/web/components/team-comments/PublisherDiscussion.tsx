"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConversationDiscussion } from "@/components/team-comments/ConversationDiscussion";
import { ShareConversationDialog } from "@/components/team-comments/ShareConversationDialog";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";
import type { TeamConversationResponse } from "@/app/api/team-comments/conversations/[conversationId]/route";

export function PublisherDiscussion({
  emailAccountId,
  providerConversationId,
}: {
  emailAccountId: string;
  providerConversationId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const commentsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const openComments = () => {
      setExpanded(true);
      commentsButton.current?.focus();
    };
    document.addEventListener("team-comments:open", openComments);
    return () =>
      document.removeEventListener("team-comments:open", openComments);
  }, []);
  const memberships = useSWR<TeamConversationsResponse>(
    "/api/team-comments/conversations",
  );
  const memberId = memberships.data?.memberships.find(
    (membership) => membership.emailAccount.id === emailAccountId,
  )?.id;
  const url = memberId
    ? `/api/team-comments/conversations?memberId=${encodeURIComponent(memberId)}&emailAccountId=${encodeURIComponent(emailAccountId)}&providerConversationId=${encodeURIComponent(providerConversationId)}`
    : null;
  const source = useSWR<TeamConversationsResponse>(url);
  const summary = useSWR<TeamConversationResponse>(
    memberId && source.data?.source
      ? `/api/team-comments/conversations/${source.data.source.id}?memberId=${encodeURIComponent(memberId)}`
      : null,
  );
  if (!memberId) return null;
  return (
    <div className="mt-6 space-y-4" data-testid="publisher-discussion">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={commentsButton}
          size="sm"
          variant="outline"
          onClick={() => setExpanded((value) => !value)}
        >
          Comments
          {source.data?.source
            ? ` (${summary.data?.commentCount ?? source.data.source.commentCount})`
            : ""}
        </Button>
        {!source.data?.source && source.data?.teammates.length ? (
          <ShareConversationDialog
            key={`${emailAccountId}:${providerConversationId}`}
            memberId={memberId}
            emailAccountId={emailAccountId}
            providerConversationId={providerConversationId}
            teammates={source.data.teammates}
            onShared={() => {
              setExpanded(true);
              source.mutate();
            }}
          />
        ) : null}
        {source.data?.source && (
          <div
            className="flex items-center gap-1"
            aria-label="Shared participants"
            role="group"
          >
            {source.data.source.participants.map((participant) => (
              <Avatar
                className="size-5"
                key={participant.memberId}
                title={participant.name}
              >
                <AvatarImage src={participant.image ?? undefined} alt="" />
                <AvatarFallback>
                  {participant.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            <span className="text-muted-foreground text-xs">
              Shared with {source.data.source.participants.length} people
            </span>
          </div>
        )}
      </div>
      {expanded &&
        (source.data?.source ? (
          <ConversationDiscussion
            key={`${memberId}:${source.data.source.id}:${source.data.source.generation}`}
            memberId={memberId}
            conversationId={source.data.source.id}
            onStopped={() => {
              setExpanded(false);
              source.mutate();
            }}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Share this conversation to start an internal discussion.
          </p>
        ))}
    </div>
  );
}
