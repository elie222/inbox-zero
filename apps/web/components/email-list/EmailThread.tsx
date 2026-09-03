import { useMemo, useState } from "react";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";
import { Button } from "@/components/ui/button";

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
  onSendSuccess,
  onOpenSenderContext,
  withHeader,
}: {
  messages: ThreadMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (messageId: string, threadId: string) => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  withHeader?: boolean;
}) {
  const organizedMessages = useMemo(
    () => organizeThreadMessages(messages),
    [messages],
  );

  const lastMessageId = organizedMessages.at(-1)?.message.id;

  /** Only the latest message is open: the state every thread starts in. */
  const latestOnly = () => new Set(lastMessageId ? [lastMessageId] : []);

  const [expandedMessageIds, setExpandedMessageIds] =
    useState<Set<string>>(latestOnly);

  const allExpanded = organizedMessages.every(({ message }) =>
    expandedMessageIds.has(message.id),
  );

  return (
    // White regardless of the surface it is dropped on: an email body renders
    // on white inside its iframe, so anything else leaves each message boxed.
    <div className="min-w-0 bg-card">
      {withHeader && (
        <div className="flex items-center justify-between">
          <div className="font-semibold text-2xl text-foreground">
            {messages[0]?.headers.subject}
          </div>
          {topRightComponent && (
            <div className="flex items-center gap-2">{topRightComponent}</div>
          )}
        </div>
      )}

      {organizedMessages.length > 1 && (
        <div className="flex items-center gap-3 pt-4">
          <span className="text-muted-foreground text-xs">
            {organizedMessages.length} messages
          </span>
          <Button
            className="ml-auto"
            onClick={() =>
              setExpandedMessageIds(
                allExpanded
                  ? latestOnly()
                  : new Set(organizedMessages.map(({ message }) => message.id)),
              )
            }
            size="xs-2"
            variant="outline"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}

      <ul className="pt-2">
        {organizedMessages.map(({ message, draftMessage }) => {
          const defaultShowReply =
            autoOpenReplyForMessageId === message.id || Boolean(draftMessage);
          return (
            <EmailMessage
              defaultShowReply={defaultShowReply}
              draftMessage={draftMessage}
              expanded={expandedMessageIds.has(message.id)}
              generateNudge={defaultShowReply && !draftMessage?.textHtml}
              key={message.id}
              message={message}
              onOpenSenderContext={onOpenSenderContext}
              onSendSuccess={(messageId) => {
                setExpandedMessageIds((prev) => {
                  if (prev.has(messageId)) return prev;
                  return new Set(prev).add(messageId);
                });

                onSendSuccess?.(messageId, message.threadId);
              }}
              // A one-message thread has nothing to collapse back to.
              onToggle={
                organizedMessages.length === 1
                  ? undefined
                  : () => {
                      setExpandedMessageIds((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(message.id)) next.add(message.id);
                        return next;
                      });
                    }
              }
              refetch={refetch}
              showReplyButton={showReplyButton}
            />
          );
        })}
      </ul>
    </div>
  );
}

// Drafts render inline under the message they reply to, so each one has to be
// matched to a parent. Outlook thread messages never carry a References header
// and only expose In-Reply-To when full internet headers are fetched, which the
// thread query does not select, so its drafts arrive with nothing to match on.
// A draft still belongs to this thread, so anything unmatched falls back to the
// message a reply would target: the most recent one.
export function organizeThreadMessages(messages: ThreadMessage[] | undefined) {
  const drafts: ThreadMessage[] = [];
  const regularMessages: ThreadMessage[] = [];

  for (const message of messages ?? []) {
    if (message.labelIds?.includes("DRAFT")) drafts.push(message);
    else regularMessages.push(message);
  }

  const draftsByMessageId = new Map<string, ThreadMessage>();
  for (const draft of drafts) {
    const parentId =
      draft.headers.references?.split(" ").pop() ||
      draft.headers["in-reply-to"];
    const parent = parentId
      ? regularMessages.find(
          (message) => message.headers["message-id"] === parentId,
        )
      : undefined;
    const target = parent ?? regularMessages.at(-1);
    if (target) draftsByMessageId.set(target.id, draft);
  }

  return regularMessages.map((message) => ({
    message,
    draftMessage: draftsByMessageId.get(message.id),
  }));
}
