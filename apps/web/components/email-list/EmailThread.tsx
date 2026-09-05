import { useEffect, useMemo, useState } from "react";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useReplyDrafts } from "@/hooks/useReplyDrafts";
import { ThreadDeliveryStatus } from "@/components/email-list/ThreadDeliveryStatus";
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
  const { emailAccountId } = useAccount();
  const threadId = messages[0]?.threadId ?? "";
  const { drafts: localDrafts } = useReplyDrafts(emailAccountId, threadId);
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

  const [expansionOverrides, setExpansionOverrides] = useState<
    Map<string, boolean>
  >(() => new Map());
  const [recoveredReply, setRecoveredReply] = useState<{
    messageId: string;
    version: number;
  }>();
  useEffect(() => {
    if (autoOpenReplyForMessageId)
      setExpansionOverrides((previous) =>
        new Map(previous).set(autoOpenReplyForMessageId, true),
      );
  }, [autoOpenReplyForMessageId]);
  const expanded = (id: string, hasDraft: boolean) =>
    expansionOverrides.get(id) ?? (id === lastMessageId || hasDraft);
  const hasLocalDraft = (id: string) =>
    localDrafts.some((draft) => draft.messageId === id);
  const allExpanded = organizedMessages.every(({ message, draftMessage }) =>
    expanded(message.id, Boolean(draftMessage) || hasLocalDraft(message.id)),
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
              setExpansionOverrides(
                new Map(
                  organizedMessages.map(({ message }) => [
                    message.id,
                    allExpanded ? message.id === lastMessageId : true,
                  ]),
                ),
              )
            }
            size="xs-2"
            variant="ghost"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}

      <ul className="pt-1">
        {organizedMessages.map(({ message, draftMessage }) => {
          const defaultShowReply =
            autoOpenReplyForMessageId === message.id ||
            recoveredReply?.messageId === message.id ||
            Boolean(draftMessage) ||
            hasLocalDraft(message.id);
          return (
            <EmailMessage
              defaultShowReply={defaultShowReply}
              draftMessage={draftMessage}
              expanded={expanded(message.id, defaultShowReply)}
              hasDraft={Boolean(draftMessage) || hasLocalDraft(message.id)}
              generateNudge={
                defaultShowReply &&
                !draftMessage?.textHtml &&
                !hasLocalDraft(message.id)
              }
              key={`${message.id}:${recoveredReply?.messageId === message.id ? recoveredReply.version : 0}`}
              message={message}
              onOpenSenderContext={onOpenSenderContext}
              onSendSuccess={(messageId) => {
                setExpansionOverrides((prev) =>
                  new Map(prev).set(messageId, true),
                );

                onSendSuccess?.(messageId, message.threadId);
              }}
              // A one-message thread has nothing to collapse back to.
              onToggle={
                organizedMessages.length === 1
                  ? undefined
                  : () => {
                      setExpansionOverrides((prev) =>
                        new Map(prev).set(
                          message.id,
                          !expanded(message.id, defaultShowReply),
                        ),
                      );
                    }
              }
              refetch={refetch}
              showReplyButton={showReplyButton}
            />
          );
        })}
      </ul>
      {threadId && (
        <ThreadDeliveryStatus
          emailAccountId={emailAccountId}
          canEditReply={showReplyButton}
          threadId={threadId}
          messageIds={messages.map((message) => message.id)}
          refetch={refetch}
          onEditReply={(messageId) => {
            setExpansionOverrides((previous) =>
              new Map(previous).set(messageId, true),
            );
            setRecoveredReply((previous) => ({
              messageId,
              version: (previous?.version ?? 0) + 1,
            }));
          }}
        />
      )}
    </div>
  );
}
