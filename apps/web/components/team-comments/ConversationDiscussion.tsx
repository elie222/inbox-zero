"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import {
  BellIcon,
  BellOffIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UserPlusIcon,
  UserXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingContent } from "@/components/LoadingContent";
import { CommentComposer } from "@/components/team-comments/CommentComposer";
import {
  ConversationParticipants,
  PersonAvatar,
} from "@/components/team-comments/ConversationParticipants";
import { useConversationDiscussion } from "@/components/team-comments/use-conversation-discussion";
import {
  deleteCommentAction,
  markConversationReadAction,
  postCommentAction,
  setConversationMutedAction,
  setParticipantAccessAction,
  stopSharingAction,
} from "@/utils/actions/team-comments";
import { formatShortDate } from "@/utils/date";
import { getActionErrorMessage } from "@/utils/error";

type ConversationDiscussionProps = {
  memberId: string;
  conversationId: string;
  showSharedViewLink?: boolean;
  onStopped?: () => void;
};

export function ConversationDiscussion(props: ConversationDiscussionProps) {
  const discussion = useConversationDiscussion(
    props.memberId,
    props.conversationId,
  );
  return <ConversationDiscussionView {...props} discussion={discussion} />;
}

export function ConversationDiscussionView({
  memberId,
  conversationId,
  showSharedViewLink = true,
  onStopped,
  discussion,
}: ConversationDiscussionProps & {
  discussion: ReturnType<typeof useConversationDiscussion>;
}) {
  const { summary, comments, revoked, refresh, loadMoreComments } = discussion;
  const { executeAsync: deleteComment } = useAction(deleteCommentAction);
  const { executeAsync: setAccess } = useAction(setParticipantAccessAction);
  const { executeAsync: stop } = useAction(stopSharingAction);
  const { executeAsync: mute } = useAction(setConversationMutedAction);
  const { executeAsync: markRead } = useAction(markConversationReadAction);
  const { executeAsync: postComment } = useAction(postCommentAction);
  const [error, setError] = useState("");
  const markedPosition = useRef("");
  const pendingPosition = useRef("");
  const generation = summary.data?.generation;
  // The loaded revision also covers invitation and participant activity, which
  // has no comment of its own.
  const loadedRevision = comments.data?.revision;
  const isRefreshing = summary.isValidating;
  useEffect(() => {
    // Waiting for the refresh to settle lets a failed mark retry after the
    // next one without retrying in a loop.
    if (generation === undefined || loadedRevision === undefined) return;
    if (isRefreshing) return;
    const position = `${memberId}:${conversationId}:${generation}:${loadedRevision}`;
    if (
      markedPosition.current === position ||
      pendingPosition.current === position
    )
      return;
    pendingPosition.current = position;
    markRead({ memberId, conversationId, throughRevision: loadedRevision })
      .then((result) => {
        if (result?.data) markedPosition.current = position;
      })
      .catch(() => {})
      .finally(() => {
        if (pendingPosition.current === position) pendingPosition.current = "";
      });
  }, [
    generation,
    loadedRevision,
    isRefreshing,
    memberId,
    conversationId,
    markRead,
  ]);
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
  const runAndRefresh = async (
    action: Promise<
      | (Parameters<typeof getActionErrorMessage>[0] & { data?: unknown })
      | undefined
    >,
  ) => {
    const result = await action;
    if (result?.data) {
      setError("");
      refresh();
    } else setError(getActionErrorMessage(result ?? {}));
    return Boolean(result?.data);
  };
  const data = summary.data;
  const participantIds =
    data?.participants.map((participant) => participant.memberId) ?? [];
  const addableTeammates =
    data?.availableTeammates.filter(
      (person) => !participantIds.includes(person.memberId),
    ) ?? [];
  return (
    <section className="space-y-4 pt-4 pb-6" aria-label="Internal discussion">
      <LoadingContent
        loading={summary.isLoading || comments.isLoading}
        error={summary.error ?? comments.error}
      >
        {data && comments.data && (
          <>
            <div className="flex items-center gap-2 border-t pt-4 text-muted-foreground text-xs">
              <ConversationParticipants
                participants={data.participants}
                currentMemberId={memberId}
                publisherMemberId={data.publisherMemberId}
                onRemove={
                  data.capabilities.manage
                    ? (targetMemberId) =>
                        runAndRefresh(
                          setAccess({
                            memberId,
                            conversationId,
                            targetMemberId,
                            access: false,
                          }),
                        )
                    : undefined
                }
              />
              <span className="flex-1">Sharing started</span>
              <time dateTime={new Date(data.sharedAt).toISOString()}>
                {formatShortDate(new Date(data.sharedAt), { lowercase: true })}
              </time>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon2xs"
                    variant="ghost"
                    aria-label="Discussion options"
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {showSharedViewLink && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/shared/${conversationId}?memberId=${encodeURIComponent(memberId)}`}
                      >
                        <ExternalLinkIcon />
                        Open shared view
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {data.capabilities.manage && addableTeammates.length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <UserPlusIcon />
                        Add teammate
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {addableTeammates.map((person) => (
                          <DropdownMenuItem
                            key={person.memberId}
                            onSelect={() =>
                              runAndRefresh(
                                setAccess({
                                  memberId,
                                  conversationId,
                                  targetMemberId: person.memberId,
                                  access: true,
                                }),
                              )
                            }
                          >
                            <PersonAvatar person={person} className="size-5" />
                            {person.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuItem
                    onSelect={() =>
                      runAndRefresh(
                        mute({ memberId, conversationId, muted: !data.muted }),
                      )
                    }
                  >
                    {data.muted ? <BellIcon /> : <BellOffIcon />}
                    {data.muted ? "Unmute" : "Mute"}
                  </DropdownMenuItem>
                  {data.capabilities.manage && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={async () => {
                          if (
                            await runAndRefresh(
                              stop({ memberId, conversationId }),
                            )
                          )
                            onStopped?.();
                        }}
                      >
                        <UserXIcon />
                        Stop sharing
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-4" aria-live="polite">
              {comments.data.nextCursor && (
                <Button size="xs-2" variant="ghost" onClick={loadMoreComments}>
                  Load older comments
                </Button>
              )}
              {comments.data.comments.map((comment) => (
                <article className="group space-y-1" key={comment.id}>
                  <div className="flex items-center gap-2">
                    <PersonAvatar person={comment.author} className="size-5" />
                    <span className="font-medium text-sm">
                      {comment.author.name}
                    </span>
                    <time
                      className="text-muted-foreground text-xs"
                      dateTime={new Date(comment.createdAt).toISOString()}
                      title={new Date(comment.createdAt).toLocaleString()}
                    >
                      {formatShortDate(new Date(comment.createdAt), {
                        lowercase: true,
                      })}
                    </time>
                    {!comment.deleted &&
                      comment.author.memberId === memberId && (
                        <Button
                          size="icon2xs"
                          variant="ghost"
                          aria-label="Delete comment"
                          className="ml-auto text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() =>
                            runAndRefresh(
                              deleteComment({
                                memberId,
                                conversationId,
                                commentId: comment.id,
                              }),
                            )
                          }
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      )}
                  </div>
                  {comment.deleted ? (
                    <p className="pl-7 text-muted-foreground text-sm italic">
                      Comment deleted
                    </p>
                  ) : (
                    <p className="ml-7 w-fit max-w-full whitespace-pre-wrap break-words rounded-md border border-l-2 border-l-primary/50 bg-muted/40 px-3 py-1.5 text-sm">
                      <CommentBody
                        body={comment.body ?? ""}
                        names={data.participants.map(
                          (participant) => participant.name,
                        )}
                      />
                    </p>
                  )}
                </article>
              ))}
            </div>
            <CommentComposer
              key={`${memberId}:${conversationId}:${data.generation}`}
              candidates={[
                ...data.participants.filter(
                  (participant) => participant.memberId !== memberId,
                ),
                ...(data.capabilities.manage ? addableTeammates : []),
              ]}
              participantIds={participantIds}
              onSubmit={async (comment) => {
                for (const targetMemberId of comment.mentionedMemberIds) {
                  if (participantIds.includes(targetMemberId)) continue;
                  const granted = await setAccess({
                    memberId,
                    conversationId,
                    targetMemberId,
                    access: true,
                  });
                  if (!granted?.data) return granted;
                }
                const result = await postComment({
                  memberId,
                  conversationId,
                  ...comment,
                });
                if (result?.data) refresh();
                return result;
              }}
            />
            {error && (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </LoadingContent>
    </section>
  );
}

function CommentBody({ body, names }: { body: string; names: string[] }) {
  if (!names.length) return body;
  const pattern = new RegExp(
    `(@(?:${names
      .toSorted((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")}))(?![\\p{L}\\p{M}\\p{N}_])`,
    "u",
  );
  return body.split(pattern).map((part, index) =>
    index % 2 ? (
      <span key={index} className="font-medium text-primary">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
