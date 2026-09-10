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
import { internalDateToDate } from "@/utils/date";
import { GmailLabel } from "@/utils/gmail/label";

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  autoOpenForwardForMessageId,
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
  autoOpenForwardForMessageId?: string;
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
  const organizedMessages = useMemo(
    () => organizeThreadMessages(messages),
    [messages],
  );

  const lastMessageId = organizedMessages.at(-1)?.message.id;

  const [expansionOverrides, setExpansionOverrides] = useState<
    Map<string, boolean>
  >(
    () =>
      new Map(
        organizedMessages
          .filter(({ message }) =>
            message.labelIds?.includes(GmailLabel.UNREAD),
          )
          .map(({ message }) => [message.id, true]),
      ),
  );
  const [recoveredReply, setRecoveredReply] = useState<{
    messageId: string;
    mode: ReplyDraftMode;
    version: number;
  }>();
  useEffect(() => {
    const messageId = autoOpenForwardForMessageId ?? autoOpenReplyForMessageId;
    if (messageId)
      setExpansionOverrides((previous) =>
        new Map(previous).set(messageId, true),
      );
  }, [autoOpenForwardForMessageId, autoOpenReplyForMessageId]);
  const expanded = (id: string, hasDraft: boolean) =>
    expansionOverrides.get(id) ?? (id === lastMessageId || hasDraft);
  const hasLocalDraft = (id: string) =>
    Boolean(getLocalDraftMode(localDrafts, id));
  const allExpanded = organizedMessages.every(({ message, draftMessages }) =>
    expanded(
      message.id,
      autoOpenReplyForMessageId === message.id ||
        autoOpenForwardForMessageId === message.id ||
        recoveredReply?.messageId === message.id ||
        draftMessages.length > 0 ||
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
        {organizedMessages.map(({ message, draftMessages }) => {
          const defaultComposeMode = getDefaultComposeMode({
            autoOpenMode:
              autoOpenForwardForMessageId === message.id
                ? "forward"
                : autoOpenReplyForMessageId === message.id
                  ? "reply"
                  : undefined,
            draftMessage: draftMessages.length > 0,
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
              draftMessages={draftMessages}
              expanded={expanded(message.id, Boolean(defaultComposeMode))}
              hasDraft={draftMessages.length > 0 || hasLocalDraft(message.id)}
              key={`${message.id}:${recoveredReply?.messageId === message.id ? recoveredReply.version : 0}`}
              message={message}
              onOpenSenderContext={onOpenSenderContext}
              onMarkDone={onMarkDone}
              onSendSuccess={(messageId, sentThreadId) => {
                setExpansionOverrides((prev) =>
                  new Map(prev).set(messageId, true),
                );

                onSendSuccess?.(messageId, sentThreadId);
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
  autoOpenMode,
  draftMessage,
  localDraftMode,
  recoveredReply,
}: {
  autoOpenMode?: ReplyDraftMode;
  draftMessage: boolean;
  localDraftMode?: ReplyDraftMode;
  recoveredReply?: { mode: ReplyDraftMode };
}) {
  if (recoveredReply) return recoveredReply.mode;
  if (autoOpenMode) return autoOpenMode;
  if (draftMessage) return "reply" as const;
  return localDraftMode;
}

// Drafts render inline under the message they reply to, so each one has to be
// matched to a parent. Outlook thread messages never carry a References header
// and only expose In-Reply-To when full internet headers are fetched, which the
// thread query does not select, so its drafts arrive with nothing to match on.
// A draft still belongs to this thread, so anything unmatched falls back to the
// message a reply would target: the most recent one.
//
// Multiple drafts may resolve to the same parent (especially Outlook drafts with
// no threading headers). Keep all of them, ordered oldest → newest, so none are
// dropped when EmailMessage renders one composer per draft.
export function organizeThreadMessages(messages: ThreadMessage[] | undefined) {
  const drafts: ThreadMessage[] = [];
  const regularMessages: ThreadMessage[] = [];

  for (const message of messages ?? []) {
    if (message.labelIds?.includes("DRAFT")) drafts.push(message);
    else regularMessages.push(message);
  }

  const draftsByMessageId = new Map<string, ThreadMessage[]>();
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
    if (!target) continue;
    const existing = draftsByMessageId.get(target.id);
    if (existing) existing.push(draft);
    else draftsByMessageId.set(target.id, [draft]);
  }

  return regularMessages.map((message) => ({
    message,
    draftMessages: sortDraftsOldestFirst(
      draftsByMessageId.get(message.id) ?? [],
    ),
  }));
}

function sortDraftsOldestFirst(drafts: ThreadMessage[]) {
  return [...drafts].sort(
    (left, right) => draftRecency(left) - draftRecency(right),
  );
}

function draftRecency(draft: ThreadMessage) {
  const value = draft.internalDate ?? draft.headers.date;
  const time = internalDateToDate(value, { fallbackToNow: false }).getTime();
  return Number.isNaN(time) ? 0 : time;
}
