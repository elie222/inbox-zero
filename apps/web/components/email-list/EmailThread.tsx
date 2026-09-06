import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { isTypingTarget } from "@/lib/shortcuts/registry";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useReplyDrafts } from "@/hooks/useReplyDrafts";
import { ThreadDeliveryStatus } from "@/components/email-list/ThreadDeliveryStatus";
import { Button } from "@/components/ui/button";
import {
  getReplyDraftMode,
  getReplyDraftSessionId,
  type ReplyDraftMode,
} from "@/utils/email-cache/reply-drafts";
import type { StoredReplyDraft } from "@/utils/email-cache/database";

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
  onSendSuccess,
  onMarkDone,
  onOpenSenderContext,
  withHeader,
  renderToolbar,
  enableMessageNavigation = false,
}: {
  messages: ThreadMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  withHeader?: boolean;
  enableMessageNavigation?: boolean;
  renderToolbar?: (controls: {
    allExpanded: boolean;
    canExpand: boolean;
    onToggleAll: () => void;
  }) => ReactNode;
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
    mode: ReplyDraftMode;
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
    Boolean(getLocalDraftMode(localDrafts, id));
  const allExpanded = organizedMessages.every(({ message, draftMessage }) =>
    expanded(
      message.id,
      autoOpenReplyForMessageId === message.id ||
        recoveredReply?.messageId === message.id ||
        Boolean(draftMessage) ||
        hasLocalDraft(message.id),
    ),
  );

  const toggleAll = () =>
    setExpansionOverrides(
      new Map(
        organizedMessages.map(({ message }) => [
          message.id,
          allExpanded ? message.id === lastMessageId : true,
        ]),
      ),
    );
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const selectedId = organizedMessages.some(
    ({ message }) => message.id === selectedMessageId,
  )
    ? selectedMessageId
    : lastMessageId;
  const threadRef = useRef<HTMLDivElement>(null);
  const selectRelativeMessage = (direction: -1 | 1, fromId = selectedId) => {
    const currentIndex = organizedMessages.findIndex(
      ({ message }) => message.id === fromId,
    );
    const nextIndex = Math.max(
      0,
      Math.min(organizedMessages.length - 1, currentIndex + direction),
    );
    const nextId = organizedMessages[nextIndex]?.message.id;
    if (!nextId) return;
    setSelectedMessageId(nextId);
    const element = Array.from(
      threadRef.current?.querySelectorAll<HTMLElement>(
        "[data-thread-message-id]",
      ) ?? [],
    ).find((item) => item.dataset.threadMessageId === nextId);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  };
  useHotkeys(
    "arrowup,arrowdown",
    (event) => selectRelativeMessage(event.key === "ArrowUp" ? -1 : 1),
    {
      enabled: enableMessageNavigation,
      scopes: ["mail"],
      useKey: true,
      preventDefault: true,
      ignoreEventWhen: (event: KeyboardEvent) =>
        event.isComposing ||
        window.getSelection()?.isCollapsed === false ||
        isTypingTarget(event.target) ||
        (event.target instanceof Element &&
          Boolean(
            event.target.closest(
              '[role="dialog"], [role="menu"], [role="listbox"]',
            ),
          )),
    },
  );

  return (
    // White regardless of the surface it is dropped on: an email body renders
    // on white inside its iframe, so anything else leaves each message boxed.
    <div className="min-w-0 bg-card" ref={threadRef}>
      {renderToolbar?.({
        allExpanded,
        canExpand: organizedMessages.length > 1,
        onToggleAll: toggleAll,
      })}
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

      {!renderToolbar && organizedMessages.length > 1 && (
        <div className="flex justify-end pt-2">
          <Tooltip
            content={
              allExpanded ? "Collapse all messages" : "Expand all messages"
            }
          >
            <Button
              aria-label={
                allExpanded ? "Collapse all messages" : "Expand all messages"
              }
              className="size-7 text-muted-foreground"
              onClick={toggleAll}
              size="icon"
              variant="ghost"
            >
              {allExpanded ? (
                <ChevronsDownUpIcon className="size-3.5" />
              ) : (
                <ChevronsUpDownIcon className="size-3.5" />
              )}
            </Button>
          </Tooltip>
        </div>
      )}

      <ul className="pt-1">
        {organizedMessages.map(({ message, draftMessage }) => {
          const defaultComposeMode = getDefaultComposeMode({
            autoOpen: autoOpenReplyForMessageId === message.id,
            draftMessage: Boolean(draftMessage),
            localDraftMode: getLocalDraftMode(localDrafts, message.id),
            recoveredReply:
              recoveredReply?.messageId === message.id
                ? recoveredReply
                : undefined,
          });
          return (
            <EmailMessage
              onNavigateMessage={
                enableMessageNavigation
                  ? (direction) => selectRelativeMessage(direction, message.id)
                  : undefined
              }
              selected={
                enableMessageNavigation ? message.id === selectedId : undefined
              }
              onSelect={
                enableMessageNavigation
                  ? () => setSelectedMessageId(message.id)
                  : undefined
              }
              defaultComposeMode={defaultComposeMode}
              draftMessage={draftMessage}
              expanded={expanded(message.id, Boolean(defaultComposeMode))}
              hasDraft={Boolean(draftMessage) || hasLocalDraft(message.id)}
              key={`${message.id}:${recoveredReply?.messageId === message.id ? recoveredReply.version : 0}`}
              message={message}
              onOpenSenderContext={onOpenSenderContext}
              onMarkDone={onMarkDone}
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
                          !expanded(message.id, Boolean(defaultComposeMode)),
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
          onEditReply={(messageId, mode) => {
            setExpansionOverrides((previous) =>
              new Map(previous).set(messageId, true),
            );
            setRecoveredReply((previous) => ({
              messageId,
              mode,
              version: (previous?.version ?? 0) + 1,
            }));
          }}
        />
      )}
    </div>
  );
}

function getLocalDraftMode(drafts: StoredReplyDraft[], messageId: string) {
  const latest = drafts
    .filter(
      (draft) =>
        draft.messageId === messageId ||
        draft.messageId === getReplyDraftSessionId(messageId, "reply") ||
        draft.messageId === getReplyDraftSessionId(messageId, "forward"),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!latest) return;
  return latest.messageId === getReplyDraftSessionId(messageId, "forward")
    ? ("forward" as const)
    : getReplyDraftMode(latest);
}

function getDefaultComposeMode({
  autoOpen,
  draftMessage,
  localDraftMode,
  recoveredReply,
}: {
  autoOpen: boolean;
  draftMessage: boolean;
  localDraftMode?: ReplyDraftMode;
  recoveredReply?: { mode: ReplyDraftMode };
}) {
  if (recoveredReply) return recoveredReply.mode;
  if (autoOpen || draftMessage) return "reply" as const;
  return localDraftMode;
}
