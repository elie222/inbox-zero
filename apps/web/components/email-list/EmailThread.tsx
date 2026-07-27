import { useMemo, useState } from "react";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";
import { getDisplayedMessage } from "@/utils/email/displayed-message";

export function EmailThread({
  messages,
  folderType,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
  onSendSuccess,
  withHeader,
}: {
  messages: ThreadMessage[];
  // Which message opens expanded follows the folder (inbox → the message
  // that's actually in the inbox); the rest stay collapsed
  folderType?: string;
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (messageId: string, threadId: string) => void;
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

  const initialMessageId = getDisplayedMessage(
    { messages: organizedMessages.map((entry) => entry.message) },
    folderType,
  )?.id;

  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    new Set(initialMessageId ? [initialMessageId] : []),
  );

  // The pane leads with the folder's message only; the rest of the
  // conversation stays behind a toggle. Draft replies force the full view —
  // the draft may hang off an earlier message.
  const hasDraftReply = organizedMessages.some(
    ({ message, draftMessage }) =>
      draftMessage || autoOpenReplyForMessageId === message.id,
  );
  const [showFullThread, setShowFullThread] = useState(hasDraftReply);
  const visibleMessages =
    showFullThread || !initialMessageId
      ? organizedMessages
      : organizedMessages.filter(
          (entry) => entry.message.id === initialMessageId,
        );
  const hiddenCount = organizedMessages.length - visibleMessages.length;

  return (
    <div className="flex-1 overflow-auto bg-muted p-4">
      {withHeader && (
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold text-foreground">
            {messages[0]?.headers.subject}
          </div>
          {topRightComponent && (
            <div className="flex items-center gap-2">{topRightComponent}</div>
          )}
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setShowFullThread(true)}
        >
          Show full conversation ({hiddenCount} more{" "}
          {hiddenCount === 1 ? "message" : "messages"})
        </button>
      )}
      <ul className="mt-4 space-y-2 sm:space-y-4">
        {visibleMessages.map(({ message, draftMessage }) => {
          const defaultShowReply =
            autoOpenReplyForMessageId === message.id || Boolean(draftMessage);
          return (
            <EmailMessage
              key={message.id}
              message={message}
              showReplyButton={showReplyButton}
              refetch={refetch}
              defaultShowReply={defaultShowReply}
              draftMessage={draftMessage}
              expanded={expandedMessageIds.has(message.id)}
              onExpand={() => {
                setExpandedMessageIds((prev) => {
                  if (prev.has(message.id)) return prev;
                  return new Set(prev).add(message.id);
                });
              }}
              onSendSuccess={(messageId) => {
                // The just-sent reply must be visible even if the chain was
                // collapsed
                setShowFullThread(true);
                setExpandedMessageIds((prev) => {
                  if (prev.has(messageId)) return prev;
                  return new Set(prev).add(messageId);
                });

                onSendSuccess?.(messageId, message.threadId);
              }}
              generateNudge={defaultShowReply && !draftMessage?.textHtml}
            />
          );
        })}
      </ul>
    </div>
  );
}
