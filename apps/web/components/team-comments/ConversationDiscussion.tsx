"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { CommentComposer } from "@/components/team-comments/CommentComposer";
import { ConversationParticipants } from "@/components/team-comments/ConversationParticipants";
import { useConversationDiscussion } from "@/components/team-comments/use-conversation-discussion";
import {
  deleteCommentAction,
  markConversationReadAction,
  setConversationMutedAction,
  setParticipantAccessAction,
  stopSharingAction,
} from "@/utils/actions/team-comments";
import { getActionErrorMessage } from "@/utils/error";

export function ConversationDiscussion({
  memberId,
  conversationId,
  showSharedViewLink = true,
}: {
  memberId: string;
  conversationId: string;
  showSharedViewLink?: boolean;
}) {
  const { summary, comments, revoked, refresh, loadMoreComments } =
    useConversationDiscussion(memberId, conversationId);
  const { executeAsync: deleteComment } = useAction(deleteCommentAction);
  const { executeAsync: setAccess } = useAction(setParticipantAccessAction);
  const { executeAsync: stop } = useAction(stopSharingAction);
  const { executeAsync: mute } = useAction(setConversationMutedAction);
  const { execute: markRead } = useAction(markConversationReadAction);
  const [error, setError] = useState("");
  const lastMarkedPosition = useRef("");
  useEffect(() => {
    if (!summary.data || !comments.data) return;
    const visibleRevision = comments.data.comments.at(-1)?.revision;
    if (
      visibleRevision === undefined ||
      visibleRevision > summary.data.revision
    )
      return;
    const position = `${memberId}:${conversationId}:${summary.data.generation}:${visibleRevision}`;
    if (lastMarkedPosition.current === position) return;
    lastMarkedPosition.current = position;
    markRead({
      memberId,
      conversationId,
      throughRevision: visibleRevision,
    });
  }, [summary.data, comments.data, memberId, conversationId, markRead]);
  const summaryErrorStatus = (summary.error as { status?: number } | undefined)
    ?.status;
  if (
    revoked ||
    (summaryErrorStatus !== undefined &&
      summaryErrorStatus >= 400 &&
      summaryErrorStatus < 500)
  )
    return (
      <div className="rounded-lg border p-4" role="alert">
        Your access to this conversation has ended.
      </div>
    );
  return (
    <section
      className="space-y-5 border-t border-border py-6"
      aria-label="Internal discussion"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-title text-lg font-semibold">
            Internal discussion
          </h2>
          <p className="text-muted-foreground text-xs">
            Comments stay with your team and are never sent as email.
          </p>
        </div>
        {showSharedViewLink && (
          <Link
            className="text-primary text-sm underline"
            href={`/shared/${conversationId}?memberId=${encodeURIComponent(memberId)}`}
          >
            Open shared view
          </Link>
        )}
      </div>
      <LoadingContent
        loading={summary.isLoading || comments.isLoading}
        error={summary.error ?? comments.error}
      >
        {summary.data && comments.data && (
          <>
            <ConversationParticipants
              participants={summary.data.participants}
            />
            <div className="space-y-3" aria-live="polite">
              {comments.data.nextCursor && (
                <Button size="sm" variant="outline" onClick={loadMoreComments}>
                  Load older comments
                </Button>
              )}
              {comments.data.comments.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No comments yet.
                </p>
              )}
              {comments.data.comments.map((comment) => (
                <article
                  className="rounded-lg border bg-card p-3"
                  key={comment.id}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {comment.author.name} ·{" "}
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                    {!comment.deleted &&
                      comment.author.memberId === memberId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const result = await deleteComment({
                              memberId,
                              conversationId,
                              commentId: comment.id,
                              clientMutationId: crypto.randomUUID(),
                            });
                            if (result?.data) refresh();
                            else setError(getActionErrorMessage(result ?? {}));
                          }}
                        >
                          Delete
                        </Button>
                      )}
                  </div>
                  {comment.deleted ? (
                    <p className="italic text-muted-foreground text-sm">
                      Comment deleted
                    </p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {comment.body}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <CommentComposer
              key={`${memberId}:${conversationId}:${summary.data.generation}`}
              memberId={memberId}
              conversationId={conversationId}
              generation={summary.data.generation}
              participants={summary.data.participants}
              onPosted={refresh}
            />
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const result = await mute({
                    memberId,
                    conversationId,
                    muted: !summary.data!.muted,
                  });
                  if (result?.data) refresh();
                  else setError(getActionErrorMessage(result ?? {}));
                }}
              >
                {summary.data.muted ? "Unmute" : "Mute"}
              </Button>
              {summary.data.capabilities.manage && (
                <>
                  <select
                    aria-label="Add teammate"
                    defaultValue=""
                    className="rounded border bg-background px-2 py-1 text-sm"
                    onChange={async (event) => {
                      const targetMemberId = event.target.value;
                      event.target.value = "";
                      if (!targetMemberId) return;
                      const result = await setAccess({
                        memberId,
                        conversationId,
                        targetMemberId,
                        access: true,
                        clientMutationId: crypto.randomUUID(),
                      });
                      if (result?.data) refresh();
                      else setError(getActionErrorMessage(result ?? {}));
                    }}
                  >
                    <option value="">Add teammate…</option>
                    {summary.data.availableTeammates
                      .filter(
                        (person) =>
                          !summary.data!.participants.some(
                            (entry) => entry.memberId === person.memberId,
                          ),
                      )
                      .map((person) => (
                        <option key={person.memberId} value={person.memberId}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                  {summary.data.participants
                    .filter((person) => person.memberId !== memberId)
                    .map((person) => (
                      <Button
                        key={person.memberId}
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const result = await setAccess({
                            memberId,
                            conversationId,
                            targetMemberId: person.memberId,
                            access: false,
                            clientMutationId: crypto.randomUUID(),
                          });
                          if (result?.data) refresh();
                          else setError(getActionErrorMessage(result ?? {}));
                        }}
                      >
                        Remove {person.name}
                      </Button>
                    ))}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const result = await stop({
                        memberId,
                        conversationId,
                        clientMutationId: crypto.randomUUID(),
                      });
                      if (result?.data) refresh();
                      else setError(getActionErrorMessage(result ?? {}));
                    }}
                  >
                    Stop sharing
                  </Button>
                </>
              )}
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </LoadingContent>
    </section>
  );
}
