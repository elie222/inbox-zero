import { CalendarInvitation } from "@/components/email-list/CalendarInvitation";
import { isCalendarInvitationMessage } from "@/utils/calendar/invitations/detection";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import {
  ForwardIcon,
  ReplyIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
} from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import {
  extractEmailAddress,
  extractNameFromEmail,
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
import { env } from "@/env";
import { isTypingTarget } from "@/lib/shortcuts/registry";
import type { ContactsResponse } from "@/app/api/user/contacts/route";
import { toastError } from "@/components/Toast";
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

type ComposeSession = { id: number; mode: ReplyDraftMode };

export function EmailMessage({
  message,
  bodyAvailable = true,
  missingBodyIds,
  menu,
  refetch,
  showReplyButton,
  defaultComposeMode,
  draftMessages,
  expanded,
  onToggle,
  onExpand,
  onSendSuccess,
  onMarkDone,
  onOpenSenderContext,
  hasDraft = false,
  selected,
  onSelect,
  onNavigateMessage,
  sentMessageOpen,
}: {
  message: ThreadMessage;
  bodyAvailable?: boolean;
  missingBodyIds?: Set<string>;
  menu?: React.ReactNode;
  draftMessages?: ThreadMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  defaultComposeMode?: ReplyDraftMode;
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
  onOpenSenderContext?: (message: ThreadMessage) => void;
  hasDraft?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
  sentMessageOpen?: SentMessageOpenState;
}) {
  const { emailAccountId } = useAccount();
  const { poppedOutDraftSessionId } = useComposeModal();
  // `null` follows `defaultComposeMode`, which the reader's Reply button flips
  // long after this message mounted.
  const [composeOverride, setComposeOverride] = useState<
    ReplyDraftMode | "closed" | null
  >(null);
  const composeMode = resolveComposeMode(
    composeOverride,
    defaultComposeMode,
    (mode) =>
      getReplyDraftSessionId(message.id, mode) === poppedOutDraftSessionId,
  );
  const serverDrafts = (draftMessages ?? []).map((draft) => ({
    message: draft,
    sessionMessageId: getDraftSessionMessageId(emailAccountId, draft.id),
  }));
  const [dismissedDraftIds, setDismissedDraftIds] = useState(
    () => new Set<string>(),
  );
  const setDraftDismissed = (sessionMessageId: string, dismissed: boolean) => {
    setDismissedDraftIds((previous) => {
      if (previous.has(sessionMessageId) === dismissed) return previous;
      const next = new Set(previous);
      if (dismissed) next.add(sessionMessageId);
      else next.delete(sessionMessageId);
      return next;
    });
  };
  const visibleDrafts = serverDrafts.filter(
    (draft) =>
      !dismissedDraftIds.has(draft.sessionMessageId) &&
      getReplyDraftSessionId(draft.sessionMessageId, "reply") !==
        poppedOutDraftSessionId,
  );
  const isDraftRow = serverDrafts.some(
    (draft) => draft.message.id === message.id,
  );
  const hasOpenComposer = Boolean(composeMode) || visibleDrafts.length > 0;

  const [showDetails, setShowDetails] = useState(false);
  const composeSessionRef = useRef(0);

  const onReply = useCallback(() => {
    composeSessionRef.current += 1;
    setComposeOverride("reply");
    onExpand?.();
  }, [onExpand]);
  const onForward = useCallback(() => {
    composeSessionRef.current += 1;
    setComposeOverride("forward");
    onExpand?.();
  }, [onExpand]);

  const onCloseCompose = useCallback(() => {
    setComposeOverride("closed");
  }, []);
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
        onReply();
      } else {
        onToggle?.();
      }
    },
    [expanded, onReply, onToggle, showReplyButton],
  );

  return (
    <li
      data-thread-message-id={message.id}
      data-selected={selected}
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
        "group/message min-w-0 border-l-2 border-transparent outline-none transition-colors focus-within:border-primary",
        selected && "border-primary",
        expanded
          ? "my-2 px-2 py-3 sm:px-5"
          : "px-2 py-1.5 hover:bg-muted/40 sm:px-5",
      )}
    >
      <MessageHeader
        expanded={expanded}
        message={message}
        menu={menu}
        onForward={onForward}
        onOpenSenderContext={onOpenSenderContext}
        onReply={onReply}
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
          {showDetails && <EmailDetails message={message} />}

          {isCalendarInvitationMessage(message) && (
            <CalendarInvitation key={message.id} messageId={message.id} />
          )}

          {!bodyAvailable && !isDraftRow && composeMode !== "forward" && (
            <p className="text-muted-foreground text-sm">
              This message hasn’t loaded yet.
            </p>
          )}
          {bodyAvailable &&
            !isDraftRow &&
            (message.textHtml ? (
              <HtmlEmail
                onForwardMessage={showReplyButton ? onForward : undefined}
                onReplyMessage={showReplyButton ? onReply : undefined}
                onNavigateMessage={onNavigateMessage}
                onFocusMessage={onSelect}
                emailAccountId={emailAccountId}
                html={message.textHtml}
                inlineAttachments={message.inline}
                messageId={message.id}
              />
            ) : (
              <PlainEmail text={message.textPlain || ""} />
            ))}

          {message.attachments && <EmailAttachments message={message} />}

          {visibleDrafts.map(({ message: draft, sessionMessageId }, index) => (
            <ReplyPanel
              key={sessionMessageId}
              autoScroll={!composeMode && index === visibleDrafts.length - 1}
              draftBodyAvailable={!missingBodyIds?.has(draft.id)}
              draftMessage={draft}
              draftSessionMessageId={sessionMessageId}
              message={message}
              onCloseCompose={() => setDraftDismissed(sessionMessageId, true)}
              onRestoreCompose={() =>
                setDraftDismissed(sessionMessageId, false)
              }
              onRestore={() => setDraftDismissed(sessionMessageId, false)}
              onSendSuccess={onSendSuccess}
              onMarkDone={onMarkDone}
              onStartDiscard={() => {
                setDraftDismissed(sessionMessageId, true);
                return {
                  id: composeSessionRef.current,
                  mode: "reply" as const,
                };
              }}
              refetch={refetch}
              composeMode="reply"
            />
          ))}
          {composeMode && (
            <ReplyPanel
              key={composerKey}
              autoScroll
              bodyAvailable={bodyAvailable}
              message={message}
              onCloseCompose={onCloseComposeAfterSend}
              onRestore={onRestoreComposeAfterSend}
              onRestoreCompose={onRestoreCompose}
              onSendSuccess={onSendSuccess}
              onMarkDone={onMarkDone}
              onStartDiscard={onStartDiscard}
              refetch={refetch}
              composeMode={composeMode}
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
  const { data: contacts } = useSWR<ContactsResponse>(
    expanded &&
      env.NEXT_PUBLIC_CONTACTS_ENABLED &&
      !isSent &&
      senderEmail &&
      emailAccountId
      ? [
          `/api/user/contacts?query=${encodeURIComponent(senderEmail)}`,
          emailAccountId,
        ]
      : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const senderImage = isSent
    ? emailAccount?.image
    : contacts?.contacts.find((contact) =>
        isSameEmailAddress(contact.emailAddress, senderEmail),
      )?.profilePictureUrl;
  const canResearchSender =
    Boolean(onOpenSenderContext) &&
    !isSent &&
    Boolean(senderEmail) &&
    !isSameEmailAddress(senderEmail, userEmail);

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
        {initialsFor(senderName)}
      </AvatarFallback>
    </Avatar>
  );
  // Fixed widths on the collapsed rows keep the snippet column aligned down
  // the thread, whichever senders are clickable.
  const senderNameClassName = cn(
    "truncate text-sm",
    expanded
      ? "max-w-40 shrink font-semibold text-foreground"
      : "w-24 shrink-0 font-medium text-secondary-foreground sm:w-28",
  );

  return (
    <div
      {...toggleProps}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onToggle && "cursor-pointer",
      )}
    >
      {canResearchSender ? (
        <Tooltip content="View public profile">
          <button
            aria-label={`View public profile for ${senderName}`}
            className={cn(
              "group/sender flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
              expanded ? "min-w-0" : "shrink-0",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onOpenSenderContext?.(message);
            }}
            type="button"
          >
            {avatar}
            <span
              className={cn(
                senderNameClassName,
                "text-left underline-offset-4 group-hover/sender:underline",
              )}
            >
              {senderName}
            </span>
          </button>
        </Tooltip>
      ) : (
        <>
          {avatar}
          <span className={senderNameClassName}>{senderName}</span>
        </>
      )}

      {expanded ? (
        <>
          <span className="hidden min-w-0 truncate text-muted-foreground text-xs sm:block">
            {recipientSummary(message.headers.to, userEmail)}
          </span>
          <Button
            aria-label={showDetails ? "Hide details" : "Show details"}
            onClick={toggleDetails}
            size="iconXs"
            variant="ghostMuted"
          >
            {showDetails ? (
              <ChevronsDownUpIcon className="size-3.5" />
            ) : (
              <ChevronsUpDownIcon className="size-3.5" />
            )}
          </Button>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
          {decodeSnippet(message.snippet)}
        </span>
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
  onMarkDone,
  onCloseCompose,
  onRestore,
  onRestoreCompose,
  onStartDiscard,
  composeMode,
  draftMessage,
  draftSessionMessageId,
  draftBodyAvailable = true,
  autoScroll = false,
  bodyAvailable = true,
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  onCloseCompose: () => void;
  onRestore?: () => void;
  onRestoreCompose: (composeSession: ComposeSession) => void;
  onStartDiscard: () => ComposeSession | undefined;
  composeMode: ReplyDraftMode;
  draftMessage?: ThreadMessage;
  draftSessionMessageId?: string;
  draftBodyAvailable?: boolean;
  autoScroll?: boolean;
  bodyAvailable?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const { popOutReply } = useComposeModal();
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

      return prepareReplyingToEmail(message);
    }
    return forwardSource ? prepareForwardingEmail(forwardSource) : undefined;
  }, [composeMode, message, draftSource, forwardSource]);

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
      return true;
    },
    [
      composeMode,
      draftMessage,
      discardDraft,
      onCloseCompose,
      onRestoreCompose,
      onStartDiscard,
      refetch,
    ],
  );

  if (draftMessage && !draftSource) {
    return (
      <p className="mt-5 text-muted-foreground text-sm">
        This message hasn’t loaded yet.
      </p>
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
    <div className="mt-5" ref={replyRef}>
      <ComposeEmailFormLazy
        providerDraftMessageId={
          composeMode === "reply" ? draftMessage?.id : undefined
        }
        draftKeyMessageId={message.id}
        draftMode={composeMode}
        draftSessionId={draftSessionId}
        onClose={onCloseCompose}
        onRestore={onRestore}
        onDiscard={onDiscard}
        onPopOut={() => {
          popOutReply({
            emailAccountId,
            draftSessionId,
            draftKeyMessageId: message.id,
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
      />
    </div>
  );
}

/** Two letters at most: initials from a display name, or the address's first letters. */
function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
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

/** "to me", "to Dana", "to me and 3 others" — who a message went out to. */
function recipientSummary(to: string | undefined, userEmail: string) {
  const recipients = splitRecipientList(to ?? "");
  if (recipients.length === 0) return "";

  // "me" leads whenever the account is in there at all, however it was addressed.
  const first =
    recipients.find((recipient) => isSameEmailAddress(recipient, userEmail)) ??
    recipients[0];
  const firstLabel = isSameEmailAddress(first, userEmail)
    ? "me"
    : extractNameFromEmail(first) || extractEmailAddress(first);

  const others = recipients.length - 1;
  if (others === 0) return `to ${firstLabel}`;
  return `to ${firstLabel} and ${others} ${others === 1 ? "other" : "others"}`;
}

const prepareReplyingToEmail = (
  message: ParsedMessage,
  content = "",
): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : formatReplySubject(message.headers.subject),
    headerMessageId: message.headers["message-id"] || undefined,
    messageId: message.id || undefined,
    threadId: message.threadId || undefined,
    // Keep original CC
    cc: message.headers.cc,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: message.headers.references,
    draftHtml: content || "",
    quotedContentHtml: html,
  };
};

const prepareForwardingEmail = (message: ParsedMessage): ReplyingToEmail => ({
  to: "",
  subject: forwardEmailSubject(message.headers.subject),
  headerMessageId: undefined,
  threadId: message.threadId || undefined,
  forwardedMessageId: message.id || undefined,
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
    subject: draft.headers.subject,
    headerMessageId: draft.headers["message-id"] || undefined,
    messageId: draft.id || undefined,
    threadId: draft.threadId || undefined,
    cc: draft.headers.cc,
    bcc: draft.headers.bcc,
    references: draft.headers.references,
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
  };
}
