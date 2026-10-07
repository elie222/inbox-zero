"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutosizeTextarea } from "@/components/ui/textarea";
import { getActionErrorMessage } from "@/utils/error";

type MentionCandidate = { memberId: string; name: string };
type SubmitResult =
  | (Parameters<typeof getActionErrorMessage>[0] & { data?: unknown })
  | undefined;

export function CommentComposer({
  candidates,
  participantIds,
  requireMention = false,
  hint,
  onSubmit,
}: {
  candidates: MentionCandidate[];
  participantIds: string[];
  requireMention?: boolean;
  hint?: ReactNode;
  onSubmit: (comment: {
    body: string;
    mentionedMemberIds: string[];
    clientMutationId: string;
  }) => Promise<SubmitResult>;
}) {
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [online, setOnline] = useState(true);
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
      : candidates.filter(
          (candidate) =>
            !mentioned.includes(candidate.memberId) &&
            candidate.name.toLowerCase().includes(mentionQuery),
        );
  const newlyShared = candidates.filter(
    (candidate) =>
      mentioned.includes(candidate.memberId) &&
      !participantIds.includes(candidate.memberId),
  );
  const canSubmit =
    online &&
    !isSubmitting &&
    Boolean(body.trim()) &&
    (!requireMention || mentioned.length > 0);
  const selectMention = (candidate: MentionCandidate) => {
    setBody((current) =>
      current.replace(
        /(?:^|\s)@([^\s@]*)$/,
        (match) =>
          `${match.startsWith("@") ? "" : match[0]}@${candidate.name} `,
      ),
    );
    setMentioned((current) => [...current, candidate.memberId]);
    setHighlighted(0);
  };
  const submit = async () => {
    if (!canSubmit) return;
    setError("");
    setIsSubmitting(true);
    const result = await onSubmit({
      body,
      mentionedMemberIds: mentioned,
      clientMutationId: mutationId,
    }).catch(() => undefined);
    setIsSubmitting(false);
    if (result?.data) {
      setBody("");
      setMentioned([]);
      setMutationId(crypto.randomUUID());
    } else setError(getActionErrorMessage(result ?? {}));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
      return;
    }
    if (suggestions.length) {
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
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectMention(suggestions[highlighted] ?? suggestions[0]);
      }
    }
  };
  const notice = newlyShared.length ? (
    <span>
      Sending will also share all past and future messages in this conversation
      with{" "}
      <span className="font-medium text-foreground">
        {new Intl.ListFormat(undefined, { type: "conjunction" }).format(
          newlyShared.map((candidate) => candidate.name),
        )}
      </span>
      .
    </span>
  ) : (
    hint
  );
  return (
    <div className="space-y-1.5">
      {notice && (
        <div className="flex items-center justify-between gap-2 px-1 text-muted-foreground text-xs">
          {notice}
        </div>
      )}
      <div className="relative">
        {suggestions.length > 0 && (
          <div
            id="comment-mentions"
            role="listbox"
            aria-label="Mention a teammate"
            className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border bg-popover p-1 shadow-md"
          >
            {suggestions.map((candidate, index) => (
              <button
                type="button"
                id={`comment-mention-${candidate.memberId}`}
                tabIndex={-1}
                role="option"
                aria-selected={index === highlighted}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm aria-selected:bg-accent"
                key={candidate.memberId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMention(candidate)}
              >
                {candidate.name}
                {!participantIds.includes(candidate.memberId) && (
                  <span className="text-muted-foreground text-xs">
                    Not shared yet
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border bg-background py-1.5 pr-1.5 pl-3 transition-[box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <label className="sr-only" htmlFor="internal-comment">
            Internal comment
          </label>
          <AutosizeTextarea
            id="internal-comment"
            className="min-h-0 flex-1 resize-none border-0 bg-transparent px-0 py-1 shadow-none focus-visible:border-0 focus-visible:ring-0"
            minRows={1}
            maxRows={10}
            maxLength={10_000}
            placeholder="Comment and @mention a teammate"
            value={body}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              const next = event.target.value;
              setBody(next);
              setMentioned((current) =>
                current.filter((id) => {
                  const candidate = candidates.find(
                    (entry) => entry.memberId === id,
                  );
                  return candidate && mentionsName(next, candidate.name);
                }),
              );
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={suggestions.length ? "comment-mentions" : undefined}
            aria-activedescendant={
              suggestions.length
                ? `comment-mention-${(suggestions[highlighted] ?? suggestions[0]).memberId}`
                : undefined
            }
          />
          <Button
            size="iconXs"
            className="rounded-full"
            variant={canSubmit ? "default" : "ghost"}
            disabled={!canSubmit}
            aria-label={error ? "Retry comment" : "Post comment"}
            onClick={submit}
          >
            <ArrowUpIcon className="size-4" />
          </Button>
        </div>
      </div>
      {!online && (
        <p className="px-1 text-muted-foreground text-xs" role="status">
          Offline. Reconnect to post your comment.
        </p>
      )}
      {error && (
        <p className="px-1 text-destructive text-xs" role="alert">
          {error} Your draft is saved here; retry when ready.
        </p>
      )}
    </div>
  );
}

function mentionsName(body: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}(?![\\p{L}\\p{M}\\p{N}_])`, "u").test(body);
}
