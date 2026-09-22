"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { postCommentAction } from "@/utils/actions/team-comments";
import { getActionErrorMessage } from "@/utils/error";

type AudienceMember = { memberId: string; name: string };

export function CommentComposer({
  memberId,
  conversationId,
  generation,
  participants,
  onPosted,
}: {
  memberId: string;
  conversationId: string;
  generation: number;
  participants: AudienceMember[];
  onPosted: () => void;
}) {
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [online, setOnline] = useState(true);
  const { executeAsync, isExecuting } = useAction(postCommentAction);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const mentionQuery = body.match(/(?:^|\s)@([^\s@]*)$/)?.[1]?.toLowerCase();
  const suggestions =
    mentionQuery === undefined
      ? []
      : participants.filter(
          (participant) =>
            participant.memberId !== memberId &&
            !mentioned.includes(participant.memberId) &&
            participant.name.toLowerCase().includes(mentionQuery),
        );
  const selectMention = (participant: AudienceMember) => {
    setBody((current) =>
      current.replace(
        /(?:^|\s)@([^\s@]*)$/,
        (match) => `${match.startsWith(" ") ? " " : ""}@${participant.name} `,
      ),
    );
    setMentioned((current) => [...current, participant.memberId]);
    setHighlighted(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % suggestions.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectMention(suggestions[highlighted] ?? suggestions[0]);
    }
  };
  return (
    <div className="space-y-2" data-generation={generation}>
      <label className="block font-medium text-sm" htmlFor="internal-comment">
        Internal comment
      </label>
      <textarea
        id="internal-comment"
        className="min-h-24 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        maxLength={10_000}
        placeholder="Write a comment for your team. Type @ to mention a participant."
        value={body}
        onChange={(event) => {
          const next = event.target.value;
          setBody(next);
          setMentioned((current) =>
            current.filter((id) => {
              const person = participants.find(
                (participant) => participant.memberId === id,
              );
              return person && next.includes(`@${person.name}`);
            }),
          );
          setSuccess(false);
        }}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-controls={suggestions.length ? "comment-mentions" : undefined}
      />
      {suggestions.length > 0 && (
        <div
          id="comment-mentions"
          role="listbox"
          aria-label="Mention a participant"
          className="rounded-md border bg-popover p-1"
        >
          {suggestions.map((participant, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === highlighted}
              className="block w-full rounded px-2 py-1 text-left text-sm aria-selected:bg-accent"
              key={participant.memberId}
              onClick={() => selectMention(participant)}
            >
              {participant.name}
            </button>
          ))}
        </div>
      )}
      {!online && (
        <p className="text-muted-foreground text-xs" role="status">
          Offline. Reconnect to post your comment.
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error} Your draft is saved here; retry when ready.
        </p>
      )}
      {success && (
        <p className="text-muted-foreground text-xs" role="status">
          Comment posted.
        </p>
      )}
      <Button
        disabled={!online || !body.trim() || isExecuting}
        onClick={async () => {
          setError("");
          const result = await executeAsync({
            memberId,
            conversationId,
            body,
            mentionedMemberIds: mentioned,
            clientMutationId: mutationId,
          });
          if (result?.data) {
            setBody("");
            setMentioned([]);
            setMutationId(crypto.randomUUID());
            setSuccess(true);
            onPosted();
          } else setError(getActionErrorMessage(result ?? {}));
        }}
      >
        {isExecuting ? "Posting…" : error ? "Retry comment" : "Post comment"}
      </Button>
    </div>
  );
}
