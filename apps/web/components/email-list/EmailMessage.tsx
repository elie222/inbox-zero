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
import { extractEmailReply } from "@/utils/parse/extract-reply.client";
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
import { formatReplySubject } from "@/utils/email/subject";
import { env } from "@/env";
import type { ContactsResponse } from "@/app/api/user/contacts/route";
import { toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import {
  getReplyDraftSessionId,
  type ReplyDraftMode,
} from "@/utils/email-cache/reply-drafts";

type ComposeSession = { id: number; mode: ReplyDraftMode };

export function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultComposeMode,
  draftMessage,
  expanded,
  onToggle,
  onSendSuccess,
  onMarkDone,
  onOpenSenderContext,
  hasDraft = false,
  selected,
  onSelect,
  onNavigateMessage,
}: {
  message: ThreadMessage;
  draftMessage?: ThreadMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultComposeMode?: ReplyDraftMode;
  expanded: boolean;
  /** Absent when the thread has a single message, which never collapses. */
  onToggle?: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  hasDraft?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
}) {
  const { emailAccountId } = useAccount();
  // `null` follows `defaultComposeMode`, which the reader's Reply button flips
  // long after this message mounted.
  const [composeOverride, setComposeOverride] = useState<
    ReplyDraftMode | "closed" | null
  >(null);
  const composeMode = resolveComposeMode(composeOverride, defaultComposeMode);

  const [showDetails, setShowDetails] = useState(false);
  const composeSessionRef = useRef(0);

  const onReply = useCallback(() => {
    composeSessionRef.current += 1;
    setComposeOverride("reply");
  }, []);
  const onForward = useCallback(() => {
    composeSessionRef.current += 1;
    setComposeOverride("forward");
  }, []);

  const onCloseCompose = useCallback(() => {
    setComposeOverride("closed");
  }, []);

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
      tabIndex={selected === undefined ? undefined : -1}
      aria-current={selected || undefined}
      onFocusCapture={onSelect}
      onClickCapture={onSelect}
      onKeyDown={onMessageKeyDown}
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
        onForward={onForward}
        onOpenSenderContext={onOpenSenderContext}
        onReply={onReply}
        onToggle={onToggle}
        onToggleKeyDown={onMessageKeyDown}
        showDetails={showDetails}
        showReplyButton={showReplyButton}
        toggleDetails={toggleDetails}
        hasDraft={hasDraft || Boolean(draftMessage)}
      />

      {expanded && (
        // Aligns the body with the sender's name rather than the avatar.
        <div className="min-w-0 pt-3 sm:pl-9">
          {showDetails && <EmailDetails message={message} />}

          {message.textHtml ? (
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
          )}

          {message.attachments && <EmailAttachments message={message} />}

          {composeMode && (
            <ReplyPanel
              defaultComposeMode={defaultComposeMode}
              draftMessage={draftMessage}
              message={message}
              onCloseCompose={onCloseCompose}
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
}: {
  message: ParsedMessage;
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

  /**
   * The composer renders inside the collapsed-away body, so replying to a
   * collapsed message has to open it first.
   */
  const compose = (open: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!expanded) onToggle?.();
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
            className="size-7 shrink-0 p-0 text-muted-foreground"
            onClick={toggleDetails}
            size="sm"
            variant="ghost"
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

      {hasDraft && !expanded && (
        <span className="shrink-0 text-primary text-xs">Draft</span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showReplyButton && (
          <span
            className={cn(
              "shrink-0 items-center transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
              expanded ? "flex sm:opacity-0" : "hidden sm:flex sm:opacity-0",
            )}
          >
            <Tooltip content="Reply">
              <Button
                className="size-7 text-muted-foreground"
                onClick={compose(onReply)}
                size="icon"
                variant="ghost"
              >
                <ReplyIcon className="size-3.5" />
                <span className="sr-only">Reply</span>
              </Button>
            </Tooltip>
            <Tooltip content="Forward">
              <Button
                className="size-7 text-muted-foreground"
                onClick={compose(onForward)}
                size="icon"
                variant="ghost"
              >
                <ForwardIcon className="size-3.5" />
                <span className="sr-only">Forward</span>
              </Button>
            </Tooltip>
          </span>
        )}
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
  onRestoreCompose,
  onStartDiscard,
  defaultComposeMode,
  composeMode,
  draftMessage,
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  onCloseCompose: () => void;
  onRestoreCompose: (composeSession: ComposeSession) => void;
  onStartDiscard: () => ComposeSession | undefined;
  defaultComposeMode?: ReplyDraftMode;
  composeMode: ReplyDraftMode;
  draftMessage?: ThreadMessage;
}) {
  const { emailAccountId } = useAccount();

  const replyRef = useRef<HTMLDivElement>(null);

  // scroll to the reply panel when it first opens
  useEffect(() => {
    if (!defaultComposeMode || !replyRef.current) return;

    // Wait for the reply panel layout before scrolling.
    const scrollTimeout = setTimeout(() => {
      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 500);

    return () => clearTimeout(scrollTimeout);
  }, [defaultComposeMode]);

  const replyingToEmail: ReplyingToEmail = useMemo(() => {
    if (composeMode === "reply") {
      if (draftMessage) return prepareDraftReplyEmail(draftMessage);

      return prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [composeMode, message, draftMessage]);

  const { executeAsync: discardDraft } = useAction(
    deleteDraftAction.bind(null, emailAccountId),
  );

  const onDiscard = useCallback(async () => {
    if (composeMode === "forward" || !draftMessage) {
      onCloseCompose();
      return true;
    }

    const discardPromise = discardDraft({ draftMessageId: draftMessage.id });
    const composeSession = onStartDiscard();
    if (!composeSession) return false;

    try {
      const result = await discardPromise;
      if (result?.serverError || result?.validationErrors) {
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
  }, [
    composeMode,
    draftMessage,
    discardDraft,
    onCloseCompose,
    onRestoreCompose,
    onStartDiscard,
    refetch,
  ]);

  return (
    <div className="mt-5" ref={replyRef}>
      <ComposeEmailFormLazy
        draftKeyMessageId={message.id}
        draftMode={composeMode}
        draftSessionId={getReplyDraftSessionId(message.id, composeMode)}
        onClose={onCloseCompose}
        onDiscard={onDiscard}
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
) {
  if (override === "closed") return;
  if (override) return override;
  return defaultComposeMode;
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
  cc: "",
  references: "",
  draftHtml: forwardEmailHtml({ content: "", message }),
  quotedContentHtml: "",
});

function prepareDraftReplyEmail(draft: ParsedMessage): ReplyingToEmail {
  const splitHtml = extractEmailReply(draft.textHtml || "");

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
