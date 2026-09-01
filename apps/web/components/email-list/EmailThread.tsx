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
  // Place draft messages as replies to their parent message
  const organizedMessages = useMemo(() => {
    const drafts = new Map<string, ThreadMessage>();
    const regularMessages: ThreadMessage[] = [];

    messages?.forEach((message) => {
      if (message.labelIds?.includes("DRAFT")) {
        // Get the parent message ID from the references or in-reply-to header
        const parentId =
          message.headers.references?.split(" ").pop() ||
          message.headers["in-reply-to"];
        if (parentId) {
          drafts.set(parentId, message);
        }
      } else {
        regularMessages.push(message);
      }
    });

    return regularMessages.map((message) => ({
      message,
      draftMessage: drafts.get(message.headers["message-id"] || ""),
    }));
  }, [messages]);

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
