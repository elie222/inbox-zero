import { useMemo, useState } from "react";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
}: {
  messages: ThreadMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
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
      draftReply: drafts.get(message.headers["message-id"] || ""),
    }));
  }, [messages]);

  const lastMessageId = organizedMessages.at(-1)?.message.id;

  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    new Set(lastMessageId ? [lastMessageId] : []),
  );

  return (
    <div className="flex-1 overflow-auto bg-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-semibold text-gray-900">
          {messages[0]?.headers.subject}
        </div>
        {topRightComponent && (
          <div className="flex items-center gap-2">{topRightComponent}</div>
        )}
      </div>
      <ul className="mt-4 space-y-2 sm:space-y-4">
        {organizedMessages.map(({ message, draftReply }) => {
          const defaultShowReply =
            autoOpenReplyForMessageId === message.id || Boolean(draftReply);
          return (
            <EmailMessage
              key={message.id}
              message={message}
              showReplyButton={showReplyButton}
              refetch={refetch}
              defaultShowReply={defaultShowReply}
              draftReply={draftReply}
              expanded={expandedMessageIds.has(message.id)}
              onExpand={() => {
                setExpandedMessageIds((prev) => {
                  if (prev.has(message.id)) return prev;
                  return new Set(prev).add(message.id);
                });
              }}
              onSendSuccess={(messageId) => {
                setExpandedMessageIds((prev) => {
                  if (prev.has(messageId)) return prev;
                  return new Set(prev).add(messageId);
                });
              }}
              generateNudge={defaultShowReply && !draftReply?.textHtml}
            />
          );
        })}
      </ul>
    </div>
  );
}
