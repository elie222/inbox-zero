"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { CommentComposer } from "@/components/team-comments/CommentComposer";
import { ConversationDiscussion } from "@/components/team-comments/ConversationDiscussion";
import { ShareConversationDialog } from "@/components/team-comments/ShareConversationDialog";
import {
  postCommentAction,
  shareConversationAction,
} from "@/utils/actions/team-comments";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";

export function PublisherDiscussion({
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}) {
  // Shared threads always show their comments; unshared ones stay hidden
  // until the composer is opened from the menu, command palette, or shortcut.
  const [open, setOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    const openComposer = () => {
      setOpen(true);
      setFocusRequest((request) => request + 1);
    };
    document.addEventListener("team-comments:open", openComposer);
    return () =>
      document.removeEventListener("team-comments:open", openComposer);
  }, []);
  useEffect(() => {
    if (!focusRequest) return;
    const focus = () => {
      const composer = document.getElementById("internal-comment");
      composer?.focus();
      composer?.scrollIntoView({ block: "nearest" });
    };
    focus();
    // A closing menu or command palette hands focus back to its trigger once
    // its exit animation ends, so focus again unless the user moved on.
    const timeout = setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active.tagName === "BUTTON")
        focus();
    }, 300);
    return () => clearTimeout(timeout);
  }, [focusRequest]);
  const { executeAsync: share } = useAction(shareConversationAction);
  const { executeAsync: postComment } = useAction(postCommentAction);
  const memberships = useSWR<TeamConversationsResponse>(
    "/api/team-comments/conversations",
  );
  const memberId = memberships.data?.memberships.find(
    (membership) => membership.emailAccount.id === emailAccountId,
  )?.id;
  const url = memberId
    ? `/api/team-comments/conversations?memberId=${encodeURIComponent(memberId)}&emailAccountId=${encodeURIComponent(emailAccountId)}&threadId=${encodeURIComponent(threadId)}`
    : null;
  const source = useSWR<TeamConversationsResponse>(url);
  if (!memberId || !source.data) return null;
  const sharedSource = source.data.source;
  const teammates = source.data.teammates;
  return (
    <div className="mt-6" data-testid="publisher-discussion">
      {sharedSource ? (
        <ConversationDiscussion
          key={`${memberId}:${sharedSource.id}:${sharedSource.generation}`}
          memberId={memberId}
          conversationId={sharedSource.id}
          onStopped={() => {
            setOpen(false);
            source.mutate();
          }}
        />
      ) : open && teammates.length ? (
        <div className="border-t pt-4 pb-6">
          <CommentComposer
            candidates={teammates.map((teammate) => ({
              memberId: teammate.id,
              name: teammate.emailAccount.name ?? teammate.emailAccount.email,
            }))}
            participantIds={[]}
            requireMention
            hint={
              <>
                <span>
                  Comments are never sent as email. @mention a teammate to share
                  this conversation.
                </span>
                <span className="flex shrink-0 items-center">
                  <ShareConversationDialog
                    memberId={memberId}
                    emailAccountId={emailAccountId}
                    threadId={threadId}
                    teammates={teammates}
                    onShared={() => source.mutate()}
                  />
                  <Button
                    size="icon2xs"
                    variant="ghost"
                    aria-label="Close comments"
                    onClick={() => setOpen(false)}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </span>
              </>
            }
            onSubmit={async (comment) => {
              const shared = await share({
                memberId,
                source: { emailAccountId, threadId },
                participantMemberIds: comment.mentionedMemberIds,
              });
              if (!shared?.data) return shared;
              const result = await postComment({
                memberId,
                conversationId: shared.data.id,
                ...comment,
              });
              if (result?.data) source.mutate();
              return result;
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
