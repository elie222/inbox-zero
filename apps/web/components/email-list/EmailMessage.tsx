import { CalendarInvitation } from "@/components/email-list/CalendarInvitation";
import { isCalendarInvitationMessage } from "@/utils/calendar/invitations/detection";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  ForwardIcon,
  ReplyAllIcon,
  ReplyIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
  UserSearchIcon,
} from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import {
  extractEmailAddress,
  extractNameFromEmail,
  formatRecipientNames,
  getInitials,
  isSameEmailAddress,
  splitRecipientList,
} from "@/utils/email";
import { formatShortDate } from "@/utils/date";
import { ComposeEmailFormLazy } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { ParsedMessage } from "@/utils/types";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { extractDraftComposerContent } from "@/utils/parse/extract-reply.client";
import type { ReplyingToEmail } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailForm";
import { createReplyContent } from "@/utils/gmail/reply";
import { cn } from "@/utils";
import { decodeSnippet } from "@/utils/gmail/decode";
import { GmailLabel } from "@/utils/gmail/label";
import { deleteDraftAction } from "@/utils/actions/mail";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { formatReplySubject } from "@/utils/email/subject";
import { buildReplyAllRecipients, formatCcList } from "@/utils/email/reply-all";
import { isTypingTarget } from "@/lib/shortcuts/registry";
import { useContactPhoto } from "@/hooks/useContactPhoto";
import { toastError } from "@/components/Toast";
import { LoadingMiniSpinner } from "@/components/Loading";
import { getActionErrorMessage } from "@/utils/error";
import {
  getDraftSessionMessageId,
  getReplyDraftSessionId,
  type ReplyDraftMode,
} from "@/utils/mail-engine/reply-drafts";
import {
  SentMessageOpenStatus,
  type SentMessageOpenState,
} from "@/components/email-list/SentMessageOpenStatus";
import {
  getMessageTranslation,
  useThreadTranslation,
  useTranslateThread,
} from "@/app/(app)/[emailAccountId]/mail/use-thread-translation";

type ComposeSession = { id: number; mode: ReplyDraftMode };

export function EmailMessage({
  message,
  bodyAvailable = true,
  missingBodyIds,
  menu,
  refetch,
  showReplyButton,
  defaultComposeMode,
  hideComposer,
  onStartCompose,
  draftMessages,
  expanded,
  onToggle,
  onExpand,
  onSendSuccess,
  onMarkDone,
  onDraftDiscarded,
  onOpenSenderContext,
  hasDraft = false,
  selected,
  onSelect,
  onNavigateMessage,
  sentMessageOpen,
  replyAnchor,
  composerSessionMessageId,
  onReplySent,
  concealSentReply,
  awaitSentReply,
  sendOperationId,
  concealed,
}: {
  message: ThreadMessage;
  bodyAvailable?: boolean;
  missingBodyIds?: Set<string>;
  menu?: React.ReactNode;
  draftMessages?: ThreadMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  defaultComposeMode?: ReplyDraftMode;
  hideComposer?: boolean;
  onStartCompose?: () => void;
  expanded: boolean;
  /** Absent when the thread has a single message, which never collapses. */
  onToggle?: () => void;
  /**
   * Keeps the message open once a composer opens in it. Otherwise a newer
   * message arriving would collapse it and hide the reply being written.
   */
  onExpand?: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  /**
   * A saved draft shown in this message was discarded. Only wired up by
   * parents for which that discard empties the conversation.
   */
  onDraftDiscarded?: () => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  hasDraft?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
  sentMessageOpen?: SentMessageOpenState;
  /** For a reply the provider hasn't sent yet: the message replies thread on. */
  replyAnchor?: ThreadMessage;
  /** Keeps a composer's draft when this message's id changes under it. */
  composerSessionMessageId?: string;
  /** A reply or forward from this message just left its composer. */
  onReplySent?: () => void;
  /** Hides a send's message as soon as it can reach the thread, before its composer hands off to it. */
  concealSentReply?: (operationId: string) => () => void;
  /**
   * Resolves once a queued send's message is ready in the thread, so its
   * composer can stay up until then instead of leaving a gap.
   */
  awaitSentReply?: (operationId: string) => Promise<void>;
  /** The send this message came from, while it is outgoing or after it syncs. */
  sendOperationId?: string;
  /** Laid out but invisible, so its body loads before it replaces the composer that sent it. */
  concealed?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const { poppedOutDraftSessionId } = useComposeModal();
  const threadTranslation = useThreadTranslation(
    emailAccountId,
    message.threadId,
  );
  const translation = getMessageTranslation(threadTranslation, message.id);
  const showTranslation = Boolean(translation && !translation.showOriginal);
  // `null` follows `defaultComposeMode`, which the reader's Reply button flips
  // long after this message mounted.
  const [composeOverride, setComposeOverride] = useState<
    ReplyDraftMode | "closed" | null
  >(null);
  const composeMode = hideComposer
    ? undefined
    : resolveComposeMode(
        composeOverride,
        defaultComposeMode,
        (mode) =>
          getReplyDraftSessionId(
            composerSessionMessageId ?? message.id,
            mode,
          ) === poppedOutDraftSessionId,
      );
  const serverDrafts = (draftMessages ?? []).map((draft) => ({
    message: draft,
    sessionMessageId: getDraftSessionMessageId(emailAccountId, draft.id),
  }));
  const [dismissedDraftIds, setDismissedDraftIds] = useState(
    () => new Set<string>(),
  );
  const setDraftDismissed = useCallback(
    (sessionMessageId: string, dismissed: boolean) => {
      setDismissedDraftIds((previous) => {
        if (previous.has(sessionMessageId) === dismissed) return previous;
        const next = new Set(previous);
        if (dismissed) next.add(sessionMessageId);
        else next.delete(sessionMessageId);
        return next;
      });
    },
    [],
  );
  const visibleDrafts = serverDrafts.filter(
    (draft) =>
      !dismissedDraftIds.has(draft.sessionMessageId) &&
      getReplyDraftSessionId(draft.sessionMessageId, "reply") !==
        poppedOutDraftSessionId,
  );
  // A new reply's autosave can sync back as a mailbox draft before the thread
  // knows the open composer saved it. Once open, the new reply keeps the
  // editor instead of being swapped for that copy mid-sentence.
  const [newReplyOpen, setNewReplyOpen] = useState(false);
  const isNewReply =
    composeMode === "reply" && (newReplyOpen || visibleDrafts.length === 0);
  if (isNewReply !== newReplyOpen) setNewReplyOpen(isNewReply);
  const shownDrafts = isNewReply ? [] : visibleDrafts;
  const composingMailboxReply = composeMode === "reply" && !isNewReply;
  const isDraftRow = serverDrafts.some(
    (draft) => draft.message.id === message.id,
  );
  const hasOpenComposer = Boolean(composeMode) || visibleDrafts.length > 0;

  const [showDetails, setShowDetails] = useState(false);
  const composeSessionRef = useRef(0);
  const messageRef = useRef<HTMLLIElement>(null);

  // The selection a reply should quote, and which composer quotes it: a saved
  // draft by its session, or the new reply when unset.
  const [pendingQuote, setPendingQuote] = useState<{
    text: string;
    draftSessionMessageId?: string;
  }>();
  const clearPendingQuote = useCallback(() => setPendingQuote(undefined), []);
  const [replyAll, setReplyAll] = useState(false);

  const onReply = useCallback(
    (quote?: string) => {
      onStartCompose?.();
      composeSessionRef.current += 1;
      setReplyAll(false);
      const savedDraft = serverDrafts[0];
      setPendingQuote(
        quote
          ? { text: quote, draftSessionMessageId: savedDraft?.sessionMessageId }
          : undefined,
      );
      if (savedDraft) {
        setDraftDismissed(savedDraft.sessionMessageId, false);
        setComposeOverride("closed");
        requestAnimationFrame(() => {
          messageRef.current
            ?.querySelector<HTMLElement>("[data-email-editor-content]")
            ?.focus();
        });
      } else {
        setComposeOverride("reply");
      }
      onExpand?.();
    },
    [onExpand, onStartCompose, serverDrafts, setDraftDismissed],
  );
  const onReplyAll = useCallback(() => {
    onReply();
    setReplyAll(true);
  }, [onReply]);
  const onForward = useCallback(() => {
    onStartCompose?.();
    composeSessionRef.current += 1;
    setComposeOverride("forward");
    onExpand?.();
  }, [onExpand, onStartCompose]);

  const onCloseCompose = useCallback(() => {
    setComposeOverride("closed");
    setPendingQuote(undefined);
  }, []);
  const closeMailboxDraft = (sessionMessageId: string) => {
    setPendingQuote(undefined);
    if (composeMode === "reply") onCloseCompose();
    setDraftDismissed(sessionMessageId, true);
  };
  const [composerKey, setComposerKey] = useState(0);
  const undoSendSessionRef = useRef<ComposeSession | null>(null);

  const onStartDiscard = useCallback((): ComposeSession | undefined => {
    if (!composeMode) return;
    const composeSession = {
      id: composeSessionRef.current,
      mode: composeMode,
    };
    onCloseCompose();
    return composeSession;
  }, [composeMode, onCloseCompose]);

  const onRestoreCompose = useCallback((composeSession: ComposeSession) => {
    if (composeSessionRef.current !== composeSession.id) return;
    composeSessionRef.current += 1;
    setComposeOverride(composeSession.mode);
  }, []);
  const onCloseComposeAfterSend = useCallback(() => {
    if (composeMode) {
      undoSendSessionRef.current = {
        id: composeSessionRef.current,
        mode: composeMode,
      };
    }
    onCloseCompose();
  }, [composeMode, onCloseCompose]);
  const onRestoreComposeAfterSend = useCallback(() => {
    const session = undoSendSessionRef.current;
    if (!session) return;
    composeSessionRef.current += 1;
    setComposerKey((key) => key + 1);
    setComposeOverride(session.mode);
  }, []);

  const toggleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails((prev) => !prev);
  }, []);

  const onMessageKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (
        event.target !== event.currentTarget ||
        (event.key !== "Enter" && event.key !== " ")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter" && expanded && showReplyButton) {
        onReply(getSelectedText(event.currentTarget));
      } else {
        onToggle?.();
      }
    },
    [expanded, onReply, onToggle, showReplyButton],
  );

  return (
    <li
      ref={messageRef}
      data-thread-message-id={message.id}
      data-send-operation-id={sendOperationId}
      data-selected={selected}
      aria-hidden={concealed || undefined}
      tabIndex={selected !== undefined || hasOpenComposer ? -1 : undefined}
      aria-current={selected || undefined}
      onFocusCapture={onSelect}
      onClickCapture={onSelect}
      onKeyDown={onMessageKeyDown}
      onKeyDownCapture={(event) => {
        // Handle draft Escape before the rich-text editor consumes it.
        if (
          hasOpenComposer &&
          event.key === "Escape" &&
          !event.defaultPrevented &&
          isTypingTarget(event.target) &&
          event.target instanceof Element &&
          event.target.closest('[data-inline-reply="true"]') &&
          !event.target.closest(
            '[role="dialog"], [role="menu"], [role="listbox"], [role="combobox"][aria-expanded="true"]',
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      className={cn(
        // Padding stays the same in both states so expanding doesn't shift
        // the header. The thread draws a sliding selection bar when it tracks
        // selection; otherwise the focused card draws its own.
        "group/message relative min-w-0 rounded bg-card px-3 py-2.5 outline-none transition-colors sm:px-4",
        selected === undefined &&
          "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l before:bg-primary before:opacity-0 focus-within:before:opacity-100",
        concealed && "invisible absolute inset-x-0",
        !expanded && "hover:bg-muted/40",
      )}
    >
      <MessageHeader
        expanded={expanded}
        message={message}
        menu={menu}
        onForward={onForward}
        onOpenSenderContext={onOpenSenderContext}
        onReply={onReply}
        onReplyAll={onReplyAll}
        onToggle={onToggle}
        onToggleKeyDown={onMessageKeyDown}
        showDetails={showDetails}
        showReplyButton={showReplyButton}
        toggleDetails={toggleDetails}
        hasDraft={hasDraft || visibleDrafts.length > 0}
        sentMessageOpen={sentMessageOpen}
      />

      {expanded && (
        // Aligns the body with the sender's name rather than the avatar.
        <div className="min-w-0 pt-3 sm:pl-9">
          {isCalendarInvitationMessage(message) && (
            <CalendarInvitation key={message.id} messageId={message.id} />
          )}

          {!bodyAvailable && !isDraftRow && composeMode !== "forward" && (
            <MessageBodyLoading />
          )}
          {!isDraftRow && threadTranslation?.loading && (
            <p className="mb-3 flex items-center gap-1.5 text-muted-foreground text-xs">
              <LoadingMiniSpinner />
              Translating…
            </p>
          )}
          {!isDraftRow && translation && (
            <TranslationNotice
              languageName={translation.languageName}
              showOriginal={translation.showOriginal}
              messageId={message.id}
              threadId={message.threadId}
            />
          )}
          {bodyAvailable && !isDraftRow && showTranslation && translation && (
            <PlainEmail text={translation.text} />
          )}
          {bodyAvailable &&
            !isDraftRow &&
            !showTranslation &&
            (message.textHtml ? (
              <HtmlEmail
                onForwardMessage={showReplyButton ? onForward : undefined}
                onReplyMessage={showReplyButton ? onReply : undefined}
                onNavigateMessage={onNavigateMessage}
                onFocusMessage={onSelect}
                emailAccountId={emailAccountId}
                html={message.textHtml}
                inlineAttachments={message.inline}
                sendOperationId={sendOperationId}
                messageId={message.id}
              />
            ) : (
              <PlainEmail text={message.textPlain || ""} />
            ))}

          {message.attachments && <EmailAttachments message={message} />}

          {shownDrafts.map(({ message: draft, sessionMessageId }, index) => (
            <ReplyPanel
              key={sessionMessageId}
              autoScroll={!composeMode && index === shownDrafts.length - 1}
              draftBodyAvailable={!missingBodyIds?.has(draft.id)}
              draftMessage={draft}
              draftSessionMessageId={sessionMessageId}
              message={message}
              onCloseCompose={() => closeMailboxDraft(sessionMessageId)}
              onRestoreCompose={() =>
                setDraftDismissed(sessionMessageId, false)
              }
              onRestore={() => setDraftDismissed(sessionMessageId, false)}
              onSendSuccess={onSendSuccess}
              onSent={onReplySent}
              concealSentReply={concealSentReply}
              awaitSentReply={awaitSentReply}
              onMarkDone={onMarkDone}
              onDraftDiscarded={onDraftDiscarded}
              quote={
                pendingQuote?.draftSessionMessageId === sessionMessageId
                  ? pendingQuote.text
                  : undefined
              }
              onQuoteInserted={clearPendingQuote}
              onStartDiscard={() => {
                closeMailboxDraft(sessionMessageId);
                return {
                  id: composeSessionRef.current,
                  mode: "reply" as const,
                };
              }}
              refetch={refetch}
              composeMode="reply"
            />
          ))}
          {composeMode && !composingMailboxReply && (
            <ReplyPanel
              key={composerKey}
              autoScroll
              bodyAvailable={bodyAvailable}
              draftSessionMessageId={composerSessionMessageId}
              message={message}
              replyAnchor={replyAnchor}
              replyAll={replyAll}
              onCloseCompose={onCloseComposeAfterSend}
              onRestore={onRestoreComposeAfterSend}
              onRestoreCompose={onRestoreCompose}
              onSendSuccess={onSendSuccess}
              onSent={onReplySent}
              concealSentReply={concealSentReply}
              awaitSentReply={awaitSentReply}
              onMarkDone={onMarkDone}
              onStartDiscard={onStartDiscard}
              refetch={refetch}
              composeMode={composeMode}
              quote={
                pendingQuote && !pendingQuote.draftSessionMessageId
                  ? pendingQuote.text
                  : undefined
              }
              onQuoteInserted={clearPendingQuote}
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * One row per message, and the whole thread's rhythm: an avatar, who sent it,
 * and when. Collapsed it also carries the snippet, so a thread reads top to
 * bottom without opening every message.
 */
function MessageHeader({
  message,
  menu,
  expanded,
  showDetails,
  toggleDetails,
  showReplyButton,
  onReply,
  onReplyAll,
  onForward,
  onOpenSenderContext,
  onToggle,
  onToggleKeyDown,
  hasDraft,
  sentMessageOpen,
}: {
  message: ParsedMessage;
  menu?: React.ReactNode;
  expanded: boolean;
  showDetails: boolean;
  toggleDetails: (e: React.MouseEvent) => void;
  showReplyButton: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  onToggle?: () => void;
  onToggleKeyDown: React.KeyboardEventHandler<HTMLElement>;
  hasDraft: boolean;
  sentMessageOpen?: SentMessageOpenState;
}) {
  const { emailAccount, emailAccountId, userEmail } = useAccount();

  const isSent = message.labelIds?.includes(GmailLabel.SENT) ?? false;
  const senderEmail = extractEmailAddress(message.headers.from);
  const senderName = isSent
    ? "Me"
    : extractNameFromEmail(message.headers.from) || senderEmail;
  const contactPhoto = useContactPhoto({
    email: expanded && !isSent ? senderEmail : null,
    emailAccountId,
  });
  const senderImage = isSent ? emailAccount?.image : contactPhoto;
  const recipients = formatRecipientNames(
    [
      ...splitRecipientList(message.headers.to ?? ""),
      ...splitRecipientList(message.headers.cc ?? ""),
    ],
    userEmail,
  );
  const canResearchSender =
    Boolean(onOpenSenderContext) &&
    !isSent &&
    Boolean(senderEmail) &&
    !isSameEmailAddress(senderEmail, userEmail);
  // A reply already keeps the CC list, so reply all only adds the other To
  // recipients. Replies to the user's own mail already go to everyone.
  const canReplyAll =
    !isSent &&
    splitRecipientList(message.headers.to ?? "").some(
      (recipient) =>
        !isSameEmailAddress(recipient, userEmail) &&
        !isSameEmailAddress(recipient, message.headers.from),
    );

  // Collapsing is the thread's call, so a row is only interactive once it has
  // been handed a toggle.
  const toggleProps: React.ComponentProps<"div"> | undefined = onToggle && {
    "aria-expanded": expanded,
    onClick: onToggle,
    onKeyDown: onToggleKeyDown,
    role: "button",
    tabIndex: 0,
  };

  const compose = (open: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    open();
  };

  const avatar = (
    <Avatar aria-hidden className="size-7 shrink-0">
      <AvatarImage alt="" src={senderImage || undefined} />
      <AvatarFallback
        className={cn(
          "font-semibold text-[10px] tracking-wide",
          isSent
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {getInitials(senderName)}
      </AvatarFallback>
    </Avatar>
  );
  // Fixed widths on the collapsed rows keep the snippet column aligned down
  // the thread.
  const senderNameClassName = cn(
    "truncate text-sm",
    expanded
      ? "min-w-0 font-medium text-foreground"
      : "w-24 shrink-0 font-medium text-secondary-foreground sm:w-28",
  );

  return (
    <div
      {...toggleProps}
      className={cn(
        "flex min-w-0 gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        expanded && showDetails ? "items-start" : "items-center",
        onToggle && "cursor-pointer",
      )}
    >
      {expanded ? (
        <>
          {showDetails ? (
            // Not one big toggle like the summary, so addresses stay
            // selectable and a click inside doesn't collapse the message.
            // biome-ignore lint/a11y/useKeyWithClickEvents: the button inside toggles from the keyboard
            <div
              className="flex min-w-0 flex-1 cursor-auto items-start gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              {avatar}
              <EmailDetails message={message}>
                <Button
                  aria-expanded
                  aria-label="Hide details"
                  onClick={toggleDetails}
                  size="iconXs"
                  variant="ghostMuted"
                >
                  <ChevronsDownUpIcon className="size-3.5" />
                </Button>
              </EmailDetails>
            </div>
          ) : (
            <button
              aria-expanded={false}
              aria-label="Show details"
              className="group/details flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={toggleDetails}
              type="button"
            >
              {avatar}
              <span className={senderNameClassName}>{senderName}</span>
              {recipients && (
                <span className="hidden min-w-0 shrink-[999] truncate text-muted-foreground text-sm sm:block">
                  to{" "}
                  <span className="font-medium text-foreground">
                    {recipients}
                  </span>
                </span>
              )}
              <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-opacity group-hover/details:opacity-100 group-focus-visible/details:opacity-100 sm:opacity-0" />
            </button>
          )}
          {canResearchSender && (
            <Tooltip content="View public profile">
              <Button
                aria-label={`View public profile for ${senderName}`}
                className="transition-opacity focus-visible:opacity-100 group-hover/message:opacity-100 sm:opacity-0"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenSenderContext?.(message);
                }}
                size="iconXs"
                variant="ghostMuted"
              >
                <UserSearchIcon className="size-3.5" />
              </Button>
            </Tooltip>
          )}
        </>
      ) : (
        <>
          {avatar}
          <span className={senderNameClassName}>{senderName}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
            {decodeSnippet(message.snippet)}
          </span>
        </>
      )}

      {hasDraft &&
        (!expanded || message.labelIds?.includes(GmailLabel.DRAFT)) && (
          <span className="shrink-0 text-primary text-xs">Draft</span>
        )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {(showReplyButton || menu) && (
          <span className="flex shrink-0 items-center transition-opacity focus-within:opacity-100 group-hover/message:opacity-100 has-[[data-state=open]]:opacity-100 sm:opacity-0">
            {showReplyButton && (
              <>
                <Tooltip shortcuts={["reply"]}>
                  <Button
                    onClick={compose(onReply)}
                    size="iconXs"
                    variant="ghostMuted"
                  >
                    <ReplyIcon className="size-3.5" />
                    <span className="sr-only">Reply</span>
                  </Button>
                </Tooltip>
                {canReplyAll && (
                  <Tooltip content="Reply all">
                    <Button
                      onClick={compose(onReplyAll)}
                      size="iconXs"
                      variant="ghostMuted"
                    >
                      <ReplyAllIcon className="size-3.5" />
                      <span className="sr-only">Reply all</span>
                    </Button>
                  </Tooltip>
                )}
                <Tooltip shortcuts={["forward"]}>
                  <Button
                    onClick={compose(onForward)}
                    size="iconXs"
                    variant="ghostMuted"
                  >
                    <ForwardIcon className="size-3.5" />
                    <span className="sr-only">Forward</span>
                  </Button>
                </Tooltip>
              </>
            )}
            {menu}
          </span>
        )}
        {isSent &&
          !message.labelIds?.includes(GmailLabel.DRAFT) &&
          sentMessageOpen && <SentMessageOpenStatus open={sentMessageOpen} />}
        <time
          className="shrink-0 whitespace-nowrap text-muted-foreground text-xs"
          dateTime={message.headers.date}
        >
          {formatShortDate(new Date(message.headers.date))}
        </time>
      </div>
    </div>
  );
}

function ReplyPanel({
  message,
  refetch,
  onSendSuccess,
  onSent,
  onMarkDone,
  onCloseCompose,
  onRestore,
  onRestoreCompose,
  onStartDiscard,
  onDraftDiscarded,
  composeMode,
  draftMessage,
  draftSessionMessageId,
  draftBodyAvailable = true,
  autoScroll = false,
  bodyAvailable = true,
  replyAnchor,
  replyAll = false,
  quote,
  onQuoteInserted,
  concealSentReply,
  awaitSentReply,
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onSent?: () => void;
  concealSentReply?: (operationId: string) => () => void;
  awaitSentReply?: (operationId: string) => Promise<void>;
  onMarkDone?: () => void;
  onCloseCompose: () => void;
  onRestore?: () => void;
  onRestoreCompose: (composeSession: ComposeSession) => void;
  onStartDiscard: () => ComposeSession | undefined;
  onDraftDiscarded?: () => void;
  composeMode: ReplyDraftMode;
  draftMessage?: ThreadMessage;
  draftSessionMessageId?: string;
  draftBodyAvailable?: boolean;
  autoScroll?: boolean;
  bodyAvailable?: boolean;
  replyAnchor?: ParsedMessage;
  replyAll?: boolean;
  quote?: string;
  onQuoteInserted?: () => void;
}) {
  const { emailAccountId, userEmail } = useAccount();
  const { popOutReply } = useComposeModal();
  const [handingOffSend, setHandingOffSend] = useState(false);
  const handoffStarted = useRef(false);
  // Also set on unmount: undo can restore a new composer in this one's place,
  // and a late handoff must not close it.
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);
  const closeAfterSend = () => {
    if (closed.current) return;
    closed.current = true;
    onCloseCompose();
  };
  const replyTargetId = replyAnchor?.id ?? message.id;
  const draftSessionId = getReplyDraftSessionId(
    draftSessionMessageId ?? message.id,
    composeMode,
  );

  const replyRef = useRef<HTMLDivElement>(null);
  // A forward owns its original source once composing starts. A later cache
  // fallback must not replace that source or discard the unsent editor state.
  const [forwardSource, setForwardSource] = useState<ParsedMessage>();
  if (composeMode === "forward" && bodyAvailable && !forwardSource)
    setForwardSource(message);
  // Once open, the composer and its local draft own the reply. A saved draft
  // that sync brings back before its body loads must not replace them.
  const [draftSource, setDraftSource] = useState<ParsedMessage>();
  if (draftMessage && draftBodyAvailable && !draftSource)
    setDraftSource(draftMessage);

  // scroll to the reply panel when it first opens
  useEffect(() => {
    if (!autoScroll || !replyRef.current) return;

    // Wait for the reply panel layout before scrolling.
    const scrollTimeout = setTimeout(() => {
      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 500);

    return () => clearTimeout(scrollTimeout);
  }, [autoScroll]);

  const replyingToEmail = useMemo((): ReplyingToEmail | undefined => {
    if (composeMode === "reply") {
      if (draftSource) return prepareDraftReplyEmail(draftSource);

      return prepareReplyingToEmail({
        message,
        threadOn: replyAnchor,
        replyAll,
        userEmail,
      });
    }
    return forwardSource
      ? prepareForwardingEmail(forwardSource, Boolean(replyAnchor))
      : undefined;
  }, [
    composeMode,
    message,
    draftSource,
    forwardSource,
    replyAnchor,
    replyAll,
    userEmail,
  ]);

  const { executeAsync: discardDraft } = useAction(
    deleteDraftAction.bind(null, emailAccountId),
  );

  const onDiscard = useCallback(
    async (draftId?: string) => {
      if (composeMode === "forward" || !draftMessage) {
        onCloseCompose();
        return true;
      }

      const discardPromise = discardDraft({
        draftMessageId: draftMessage.id,
        draftId,
      });
      const composeSession = onStartDiscard();
      if (!composeSession) return false;

      try {
        const result = await discardPromise;
        if (
          result &&
          (result.serverError !== undefined ||
            result.validationErrors !== undefined)
        ) {
          toastError({
            description: getActionErrorMessage(result, {
              prefix: "Failed to discard draft",
            }),
          });
          onRestoreCompose(composeSession);
          return false;
        }
      } catch {
        toastError({ description: "Failed to discard draft" });
        onRestoreCompose(composeSession);
        return false;
      } finally {
        refetch();
      }
      onDraftDiscarded?.();
      return true;
    },
    [
      composeMode,
      draftMessage,
      discardDraft,
      onCloseCompose,
      onDraftDiscarded,
      onRestoreCompose,
      onStartDiscard,
      refetch,
    ],
  );

  if (draftMessage && !draftSource) {
    return (
      <div className="mt-5">
        <MessageBodyLoading />
      </div>
    );
  }

  if (!replyingToEmail)
    return (
      <div className="mt-5 flex gap-2">
        <Button onClick={refetch} size="sm" variant="outline">
          Load message to forward
        </Button>
        <Button onClick={onCloseCompose} size="sm" variant="ghost">
          Cancel
        </Button>
      </div>
    );

  return (
    <div className="mt-5" inert={handingOffSend} ref={replyRef}>
      <ComposeEmailFormLazy
        providerDraftMessageId={
          composeMode === "reply" ? draftMessage?.id : undefined
        }
        draftKeyMessageId={replyTargetId}
        draftMode={composeMode}
        draftSessionId={draftSessionId}
        onSubmitting={concealSentReply}
        onClose={(queuedOperationId?: string) => {
          // An offline send closes again once queued; the handoff closes it.
          if (handoffStarted.current) return;
          // Before the handoff, so this message stays open once the sent
          // reply below it is the newest.
          onSent?.();
          if (!queuedOperationId || !awaitSentReply) {
            closeAfterSend();
            return;
          }
          // Closing now would leave the thread without the reply until the
          // sent message's body has loaded.
          handoffStarted.current = true;
          setHandingOffSend(true);
          awaitSentReply(queuedOperationId).then(closeAfterSend);
        }}
        onRestore={() => {
          // Undo restores a fresh composer, which needs this one closed first.
          if (handoffStarted.current) closeAfterSend();
          onRestore?.();
        }}
        onDiscard={onDiscard}
        onPopOut={() => {
          popOutReply({
            emailAccountId,
            draftSessionId,
            draftKeyMessageId: replyTargetId,
            draftMode: composeMode,
            providerDraftMessageId:
              composeMode === "reply" ? draftMessage?.id : undefined,
            replyingToEmail,
            onReturn: onRestore,
          });
          onCloseCompose();
        }}
        onMarkDone={onMarkDone}
        onSuccess={(messageId: string, threadId: string) => {
          onSendSuccess(messageId, threadId);
          onCloseCompose();
        }}
        refetch={refetch}
        replyingToEmail={replyingToEmail}
        quote={quote}
        onQuoteInserted={onQuoteInserted}
      />
    </div>
  );
}

function resolveComposeMode(
  override: ReplyDraftMode | "closed" | null,
  defaultComposeMode: ReplyDraftMode | undefined,
  isPoppedOut: (mode: ReplyDraftMode) => boolean,
) {
  if (override === "closed") return;
  const mode = override ?? defaultComposeMode;
  // A popped-out reply is written in its own window, not inline.
  if (mode && isPoppedOut(mode)) return;
  return mode;
}

const prepareReplyingToEmail = ({
  message,
  threadOn = message,
  replyAll,
  userEmail,
}: {
  message: ParsedMessage;
  threadOn?: ParsedMessage;
  replyAll: boolean;
  userEmail: string;
}): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });
  const replyTo = message.headers["reply-to"] || message.headers.from;
  const replyAllCc =
    replyAll && !sentFromUser
      ? buildReplyAllRecipients(message.headers, replyTo, userEmail).cc
      : undefined;

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : replyTo,
    fromHint: getFromHint(message),
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : formatReplySubject(message.headers.subject),
    headerMessageId: threadOn.headers["message-id"] || undefined,
    messageId: threadOn.id || undefined,
    threadId: threadOn.threadId || undefined,
    // Keep original CC
    cc: replyAllCc ? formatCcList(replyAllCc) : message.headers.cc,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: threadOn.headers.references,
    draftHtml: "",
    quotedContentHtml: html,
  };
};

const prepareForwardingEmail = (
  message: ParsedMessage,
  unsent = false,
): ReplyingToEmail => ({
  to: "",
  fromHint: getFromHint(message),
  subject: forwardEmailSubject(message.headers.subject),
  headerMessageId: undefined,
  threadId: message.threadId || undefined,
  // The provider has no copy of an unsent message to forward from.
  forwardedMessageId: unsent ? undefined : message.id || undefined,
  forwardedAttachments: message.attachments?.map((attachment) => ({
    id: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
  })),
  cc: "",
  references: "",
  draftHtml: forwardEmailHtml({ content: "", message }),
  quotedContentHtml: "",
});

function prepareDraftReplyEmail(draft: ParsedMessage): ReplyingToEmail {
  const splitHtml = extractDraftComposerContent(
    draft.textHtml,
    draft.textPlain,
  );

  return {
    to: draft.headers.to,
    fromHint: draft.headers.from,
    subject: draft.headers.subject,
    headerMessageId: draft.headers["message-id"] || undefined,
    messageId: draft.id || undefined,
    threadId: draft.threadId || undefined,
    cc: draft.headers.cc,
    bcc: draft.headers.bcc,
    references: draft.headers.references,
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
    draftHasAttachments: Boolean(
      draft.attachments?.length || draft.inline?.length,
    ),
  };
}

// Follow-ups to the user's own mail keep its sender; replies to received mail
// go out from whichever of the user's addresses it was sent to.
function getFromHint(message: ParsedMessage) {
  if (message.labelIds?.includes("SENT")) return message.headers.from;
  return [message.headers.to, message.headers.cc].filter(Boolean).join(", ");
}

function TranslationNotice({
  languageName,
  showOriginal,
  messageId,
  threadId,
}: {
  languageName: string | null;
  showOriginal: boolean;
  messageId: string;
  threadId: string;
}) {
  const { emailAccountId } = useAccount();
  const translateThread = useTranslateThread();
  let status = "Showing original";
  if (!showOriginal) {
    status = languageName ? `Translated from ${languageName}` : "Translated";
  }

  return (
    <p className="mb-3 flex items-center gap-1.5 text-muted-foreground text-xs">
      {status}
      <span aria-hidden>·</span>
      <button
        className="text-primary hover:underline"
        onClick={(event) => {
          event.stopPropagation();
          translateThread({
            emailAccountId,
            threadId,
            messageIds: [messageId],
          });
        }}
        type="button"
      >
        {showOriginal ? "Show translation" : "Show original"}
      </button>
    </p>
  );
}

function MessageBodyLoading() {
  return (
    <p
      data-email-ready="false"
      className="flex items-center gap-2 text-muted-foreground text-sm"
      role="status"
    >
      <LoadingMiniSpinner />
      Loading message…
    </p>
  );
}

// Plain-text bodies render in the page, so their selection is the window's.
function getSelectedText(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  if (!container.contains(selection.anchorNode)) return;
  return selection.toString().trim() || undefined;
}
