import { OpenedConversationAttachments } from "./OpenedConversationAttachments";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { isSendCommandFor } from "@/app/(app)/[emailAccountId]/compose/queued-reply";
import { useHotkeys } from "react-hotkeys-hook";
import { isTypingTarget } from "@/lib/shortcuts/registry";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useReplyDrafts } from "@/hooks/useReplyDrafts";
import { ThreadDeliveryStatus } from "@/components/email-list/ThreadDeliveryStatus";
import { useHiddenDraftMessageIds } from "@/hooks/useHiddenDraftMessageIds";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import {
  getDraftSessionMessageId,
  getLatestDraftMessageId,
  getReplyDraftMode,
  getReplyDraftSessionId,
  type ReplyDraftMode,
  type StoredReplyDraft,
} from "@/utils/mail-engine/reply-drafts";
import { internalDateToDate } from "@/utils/date";
import { GmailLabel } from "@/utils/gmail/label";
import { useSentMessageOpens } from "@/hooks/useSentMessageOpens";
import type { OutgoingThreadMessage } from "@/utils/mail-engine/conversation-thread";

const NO_OUTGOING: OutgoingThreadMessage[] = [];
// A send that never reaches the thread, or a body that never measures, must not
// hold its composer open.
const SENT_REPLY_HANDOFF_TIMEOUT_MS = 1000;

export function EmailThread({
  messages,
  missingBodyIds,
  outgoing = NO_OUTGOING,
  sendOperationIds,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  autoOpenForwardForMessageId,
  topRightComponent,
  onSendSuccess,
  onMarkDone,
  onOpenSenderContext,
  onThreadDiscarded,
  withHeader,
  renderToolbar,
  renderMessageMenu,
  enableMessageNavigation = false,
}: {
  messages: ThreadMessage[];
  missingBodyIds?: Set<string>;
  /** Sends queued on this device, shown after the thread until they sync. */
  outgoing?: OutgoingThreadMessage[];
  /** The send each confirmed message came from, so it replaces its outgoing copy in place. */
  sendOperationIds?: Map<string, string>;
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  autoOpenForwardForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (
    messageId: string,
    sentThreadId: string,
    repliedThreadId: string,
  ) => void;
  onMarkDone?: () => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  /** The conversation's only message was a draft, and it has been discarded. */
  onThreadDiscarded?: () => void;
  withHeader?: boolean;
  enableMessageNavigation?: boolean;
  renderMessageMenu?: (message: ThreadMessage) => ReactNode;
  renderToolbar?: (controls: {
    allExpanded: boolean;
    canExpand: boolean;
    onToggleAll: () => void;
  }) => ReactNode;
}) {
  const { emailAccountId, userEmail } = useAccount();
  const threadId = messages[0]?.threadId ?? "";
  const { drafts: localDrafts, isLoading: draftsLoading } = useReplyDrafts(
    emailAccountId,
    threadId,
    [
      ...messages
        .filter((message) => !message.labelIds?.includes(GmailLabel.DRAFT))
        .map((message) => getComposerMessageId(message.id, sendOperationIds)),
      ...outgoing.map((item) => item.message.id),
    ],
  );
  const { data: sentMessageOpens } = useSentMessageOpens(threadId || null);
  const hiddenDraftMessageIds = useHiddenDraftMessageIds(emailAccountId);
  // Concealed from the moment the send is submitted, because the thread can
  // render its message before the composer learns the send was queued. The
  // drafts shown at submit stay shown until then too: a send drops the mailbox
  // draft it replaces, which would remove its composer before the message can
  // take its place.
  const [sentReplyHandoff, setSentReplyHandoff] = useState<{
    operationId: string;
    heldDrafts: ThreadMessage[];
    release?: () => void;
  }>();
  const heldDrafts = sentReplyHandoff?.heldDrafts;
  const threadMessages = useMemo(
    () => (heldDrafts ? withHeldDrafts(messages, heldDrafts) : messages),
    [messages, heldDrafts],
  );
  const shownHiddenDraftMessageIds = useMemo(
    () =>
      heldDrafts
        ? hiddenDraftMessageIds.filter(
            (id) => !heldDrafts.some((draft) => draft.id === id),
          )
        : hiddenDraftMessageIds,
    [hiddenDraftMessageIds, heldDrafts],
  );
  const organizedMessages = useMemo(
    (): Array<{
      message: ThreadMessage;
      draftMessages: ThreadMessage[];
      outgoing?: OutgoingThreadMessage;
    }> => [
      ...organizeThreadMessages(
        withoutDraftMessages(
          withoutReplacedDrafts(threadMessages, emailAccountId),
          [
            ...localDrafts.flatMap(
              (draft) => draft.content?.providerDraftMessageIds ?? [],
            ),
            ...shownHiddenDraftMessageIds,
            // Opening a mailbox copy before the local lookup creates a second session.
            ...(draftsLoading
              ? threadMessages.map((message) => message.id)
              : []),
          ],
        ),
      ),
      ...outgoing.map((item) => ({
        message: {
          ...item.message,
          headers: { ...item.message.headers, from: userEmail },
        },
        draftMessages: [],
        outgoing: item,
      })),
    ],
    [
      threadMessages,
      emailAccountId,
      localDrafts,
      draftsLoading,
      shownHiddenDraftMessageIds,
      outgoing,
      userEmail,
    ],
  );

  // A conversation whose only message is a draft — how the Drafts folder lists
  // one — stops existing the moment that draft is discarded.
  const isDraftOnlyConversation =
    organizedMessages.length === 1 &&
    Boolean(organizedMessages[0].message.labelIds?.includes(GmailLabel.DRAFT));
  const lastMessageId = organizedMessages.at(-1)?.message.id;
  // A reply that hasn't reached the provider has no id to thread on yet, so
  // replying to it threads on the newest message the provider has.
  const replyAnchor = organizedMessages.findLast(
    ({ message, outgoing }) =>
      !outgoing && !message.labelIds?.includes(GmailLabel.DRAFT),
  )?.message;

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
  const [activeCompose, setActiveCompose] = useState<{
    threadId: string;
    messageId: string;
  }>();
  const activeComposeMessageId =
    activeCompose?.threadId === threadId
      ? getComposerMessageId(activeCompose.messageId, sendOperationIds)
      : undefined;
  const [recoveredReply, setRecoveredReply] = useState<{
    messageId: string;
    mode: ReplyDraftMode;
    version: number;
  }>();
  useEffect(() => {
    const messageId = autoOpenForwardForMessageId ?? autoOpenReplyForMessageId;
    if (messageId) {
      setActiveCompose({ threadId, messageId });
      setExpansionOverrides((previous) =>
        new Map(previous).set(messageId, true),
      );
    }
  }, [autoOpenForwardForMessageId, autoOpenReplyForMessageId, threadId]);
  const expanded = (id: string, hasDraft: boolean) =>
    expansionOverrides.get(id) ?? (id === lastMessageId || hasDraft);
  // A sent reply keeps its local draft until delivery so undo can restore it,
  // but it is no longer an open draft. Leaving and returning to the thread
  // must not reopen it with a live Send button.
  const unsentLocalDrafts = useMemo(() => {
    const submitted = [
      ...outgoing.map((item) => item.operationId),
      ...(sendOperationIds?.values() ?? []),
    ];
    return localDrafts.filter((draft) => {
      const requestId = draft.content?.requestId;
      return !(
        requestId &&
        submitted.some((operationId) =>
          isSendCommandFor(operationId, requestId),
        )
      );
    });
  }, [localDrafts, outgoing, sendOperationIds]);
  const localDraftModeFor = (message: ThreadMessage) => {
    if (message.labelIds?.includes(GmailLabel.DRAFT)) return;
    return getLocalDraftMode(
      unsentLocalDrafts,
      getComposerMessageId(message.id, sendOperationIds),
    );
  };
  const hasLocalDraft = (message: ThreadMessage) =>
    Boolean(localDraftModeFor(message));
  const allExpanded = organizedMessages.every(({ message, draftMessages }) =>
    expanded(
      message.id,
      autoOpenReplyForMessageId === message.id ||
        autoOpenForwardForMessageId === message.id ||
        recoveredReply?.messageId === message.id ||
        draftMessages.length > 0 ||
        hasLocalDraft(message),
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
  const currentDrafts = () =>
    messages.filter(
      (message) =>
        message.labelIds?.includes(GmailLabel.DRAFT) &&
        !hiddenDraftMessageIds.includes(message.id),
    );
  const concealSentReply = (operationId: string) => {
    setSentReplyHandoff({ operationId, heldDrafts: currentDrafts() });
    return () =>
      setSentReplyHandoff((current) =>
        current?.operationId === operationId && !current.release
          ? undefined
          : current,
      );
  };
  const awaitSentReply = (operationId: string) =>
    new Promise<void>((release) =>
      setSentReplyHandoff((current) => ({
        operationId,
        release,
        heldDrafts:
          current?.operationId === operationId
            ? current.heldDrafts
            : currentDrafts(),
      })),
    );
  useEffect(() => {
    if (!sentReplyHandoff?.release) return;
    const { operationId, release } = sentReplyHandoff;
    let frame = 0;
    const finish = () => {
      release();
      setSentReplyHandoff(undefined);
    };
    const timeout = setTimeout(finish, SENT_REPLY_HANDOFF_TIMEOUT_MS);
    // The row commits before its html body has been prepared and measured.
    const check = () => {
      const row = Array.from(
        threadRef.current?.querySelectorAll<HTMLElement>(
          "[data-send-operation-id]",
        ) ?? [],
      ).find((item) => item.dataset.sendOperationId === operationId);
      const bodies = row?.querySelectorAll<HTMLElement>("[data-email-ready]");
      if (
        bodies &&
        Array.from(bodies).every((body) => body.dataset.emailReady === "true")
      ) {
        clearTimeout(timeout);
        finish();
        return;
      }
      frame = requestAnimationFrame(check);
    };
    check();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      release();
    };
  }, [sentReplyHandoff]);
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
    <OpenedConversationAttachments
      allowUncached
      emailAccountId={emailAccountId}
      threadId={threadId}
    >
      <div className="min-w-0" ref={threadRef}>
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
                onClick={toggleAll}
                size="iconXs"
                variant="ghostMuted"
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

        <ul className="relative flex flex-col gap-2 pt-1">
          {enableMessageNavigation && <SelectionBar selectedId={selectedId} />}
          {organizedMessages.map(({ message, draftMessages, outgoing }) => {
            const sendOperationId =
              outgoing?.operationId ?? sendOperationIds?.get(message.id);
            let autoOpenMode: ReplyDraftMode | undefined;
            if (autoOpenForwardForMessageId === message.id)
              autoOpenMode = "forward";
            else if (autoOpenReplyForMessageId === message.id)
              autoOpenMode = "reply";
            const recoveredMode =
              recoveredReply?.messageId === message.id
                ? recoveredReply.mode
                : undefined;
            const defaultComposeMode =
              recoveredMode ?? autoOpenMode ?? localDraftModeFor(message);
            return (
              <EmailMessage
                bodyAvailable={!missingBodyIds?.has(message.id)}
                missingBodyIds={missingBodyIds}
                onNavigateMessage={
                  enableMessageNavigation
                    ? (direction) =>
                        selectRelativeMessage(direction, message.id)
                    : undefined
                }
                selected={
                  enableMessageNavigation
                    ? message.id === selectedId
                    : undefined
                }
                onSelect={
                  enableMessageNavigation
                    ? () => setSelectedMessageId(message.id)
                    : undefined
                }
                hideComposer={Boolean(
                  activeComposeMessageId &&
                    activeComposeMessageId !==
                      getComposerMessageId(message.id, sendOperationIds),
                )}
                onStartCompose={() =>
                  setActiveCompose({ threadId, messageId: message.id })
                }
                defaultComposeMode={defaultComposeMode}
                draftMessages={draftMessages}
                expanded={expanded(
                  message.id,
                  Boolean(defaultComposeMode) || draftMessages.length > 0,
                )}
                hasDraft={draftMessages.length > 0 || hasLocalDraft(message)}
                // A draft-only row follows its draft across Gmail's per-save
                // message IDs, and a sent row keeps the place of its outgoing copy.
                key={`${sendOperationId ?? getDraftSessionMessageId(emailAccountId, message.id)}:${recoveredReply?.messageId === message.id ? recoveredReply.version : 0}`}
                message={message}
                menu={renderMessageMenu?.(message)}
                replyAnchor={outgoing ? replyAnchor : undefined}
                composerSessionMessageId={
                  sendOperationId ? `outgoing:${sendOperationId}` : undefined
                }
                sendOperationId={sendOperationId}
                concealed={
                  Boolean(sendOperationId) &&
                  sentReplyHandoff?.operationId === sendOperationId
                }
                concealSentReply={concealSentReply}
                awaitSentReply={awaitSentReply}
                onReplySent={() => {
                  // The sent reply lands below as the newest message; keep this
                  // one open and let selection fall through to the reply.
                  setExpansionOverrides((prev) =>
                    new Map(prev).set(message.id, true),
                  );
                  setSelectedMessageId(undefined);
                }}
                onOpenSenderContext={onOpenSenderContext}
                onMarkDone={onMarkDone}
                onDraftDiscarded={
                  isDraftOnlyConversation ? onThreadDiscarded : undefined
                }
                onExpand={() =>
                  setExpansionOverrides((prev) =>
                    new Map(prev).set(message.id, true),
                  )
                }
                onSendSuccess={(messageId, sentThreadId) => {
                  setExpansionOverrides((prev) =>
                    new Map(prev).set(messageId, true),
                  );

                  onSendSuccess?.(messageId, sentThreadId, threadId);
                }}
                // A one-message thread has nothing to collapse back to.
                onToggle={
                  organizedMessages.length === 1
                    ? undefined
                    : () => {
                        setExpansionOverrides((prev) =>
                          new Map(prev).set(
                            message.id,
                            !expanded(
                              message.id,
                              Boolean(defaultComposeMode) ||
                                draftMessages.length > 0,
                            ),
                          ),
                        );
                      }
                }
                refetch={refetch}
                sentMessageOpen={sentMessageOpens?.opens[message.id]}
                showReplyButton={
                  showReplyButton &&
                  !message.labelIds?.includes(GmailLabel.DRAFT)
                }
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
              setActiveCompose({ threadId, messageId });
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
    </OpenedConversationAttachments>
  );
}

function getComposerMessageId(
  messageId: string,
  sendOperationIds?: Map<string, string>,
) {
  const operationId = sendOperationIds?.get(messageId);
  return operationId ? `outgoing:${operationId}` : messageId;
}

function getLocalDraftMode(drafts: StoredReplyDraft[], messageId: string) {
  const latest = drafts
    .filter(
      (draft) =>
        draft.messageId === getReplyDraftSessionId(messageId, "reply") ||
        draft.messageId === getReplyDraftSessionId(messageId, "forward"),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!latest) return;
  return latest.messageId === getReplyDraftSessionId(messageId, "forward")
    ? ("forward" as const)
    : getReplyDraftMode(latest);
}

// Drafts without reply headers still belong to this conversation. Keep each
// composer, falling back to the latest message when its parent is unavailable.
export function organizeThreadMessages(messages: ThreadMessage[]) {
  const drafts: ThreadMessage[] = [];
  const regularMessages: ThreadMessage[] = [];

  for (const message of messages) {
    if (message.labelIds?.includes(GmailLabel.DRAFT)) drafts.push(message);
    else regularMessages.push(message);
  }

  if (regularMessages.length === 0) {
    return sortDraftsOldestFirst(drafts).map((draft) => ({
      message: draft,
      draftMessages: [draft],
    }));
  }

  const messagesByHeaderId = new Map<string, ThreadMessage>();
  for (const message of regularMessages) {
    const headerId = message.headers["message-id"];
    if (headerId && !messagesByHeaderId.has(headerId)) {
      messagesByHeaderId.set(headerId, message);
    }
  }
  const draftsByMessageId = new Map<string, ThreadMessage[]>();
  for (const draft of drafts) {
    const parentId =
      draft.headers.references?.trim().split(/\s+/).at(-1) ||
      draft.headers["in-reply-to"]?.trim();
    const parent = parentId ? messagesByHeaderId.get(parentId) : undefined;
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

function withHeldDrafts(messages: ThreadMessage[], held: ThreadMessage[]) {
  const ids = new Set(messages.map((message) => message.id));
  const missing = held.filter((draft) => !ids.has(draft.id));
  return missing.length ? [...messages, ...missing] : messages;
}

// A saved draft's old and new Gmail messages can both be in the conversation
// until sync removes the old one. Only the latest save is the draft being edited.
function withoutReplacedDrafts(
  messages: ThreadMessage[],
  emailAccountId: string,
) {
  const messageIds = new Set(messages.map((message) => message.id));
  return messages.filter((message) => {
    if (!message.labelIds?.includes(GmailLabel.DRAFT)) return true;
    const latest = getLatestDraftMessageId(
      emailAccountId,
      getDraftSessionMessageId(emailAccountId, message.id),
    );
    return !latest || latest === message.id || !messageIds.has(latest);
  });
}

// A reply with files is saved to the mailbox while its composer is open, and
// stays there until a scheduled send goes out from it. The composer or the
// delivery status already shows it, so the saved copy would be a second editor.
function withoutDraftMessages(messages: ThreadMessage[], draftIds: string[]) {
  if (!draftIds.length) return messages;
  return messages.filter(
    (message) =>
      !message.labelIds?.includes(GmailLabel.DRAFT) ||
      !draftIds.includes(message.id),
  );
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

// One bar for the whole thread so it can slide between messages. It only
// animates when the selection moves; layout changes (expanding, bodies
// loading) reposition it instantly so it never trails the card.
function SelectionBar({ selectedId }: { selectedId?: string }) {
  const barRef = useRef<HTMLLIElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    height: number;
    animate: boolean;
  }>();
  const previousId = useRef<string>(undefined);

  useLayoutEffect(() => {
    const list = barRef.current?.parentElement;
    if (!list || !selectedId) {
      setPosition(undefined);
      return;
    }
    const measure = (animate: boolean) => {
      const item = Array.from(
        list.querySelectorAll<HTMLElement>(":scope > [data-thread-message-id]"),
      ).find((element) => element.dataset.threadMessageId === selectedId);
      // A sent reply stays hidden until its body loads; it shows the bar once
      // it joins the layout and resizes the list.
      if (!item || item.ariaHidden === "true") return setPosition(undefined);
      setPosition({ top: item.offsetTop, height: item.offsetHeight, animate });
    };
    measure(
      previousId.current !== undefined && previousId.current !== selectedId,
    );
    previousId.current = selectedId;
    // The observer reports once on start; skipping it keeps the slide running.
    let started = false;
    const observer = new ResizeObserver(() => {
      if (started) measure(false);
      started = true;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [selectedId]);

  return (
    <li
      aria-hidden
      ref={barRef}
      role="presentation"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-10 w-1 rounded-l bg-primary",
        !position && "hidden",
        position?.animate &&
          "transition-[transform,height] duration-200 ease-out motion-reduce:transition-none",
      )}
      style={
        position && {
          height: position.height,
          transform: `translateY(${position.top}px)`,
        }
      }
    />
  );
}
