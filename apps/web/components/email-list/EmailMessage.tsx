import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import {
  ForwardIcon,
  ReplyIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
  UserRoundSearchIcon,
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
import { Card } from "@/components/ui/card";
import type { ParsedMessage } from "@/utils/types";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { extractEmailReply } from "@/utils/parse/extract-reply.client";
import type { ReplyingToEmail } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailForm";
import { createReplyContent } from "@/utils/gmail/reply";
import { cn } from "@/utils";
import { decodeSnippet } from "@/utils/gmail/decode";
import { GmailLabel } from "@/utils/gmail/label";
import { generateNudgeReplyAction } from "@/utils/actions/generate-reply";
import { deleteDraftAction } from "@/utils/actions/mail";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";
import { Loading } from "@/components/Loading";
import { MessageText } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { formatReplySubject } from "@/utils/email/subject";
import { env } from "@/env";
import type { ContactsResponse } from "@/app/api/user/contacts/route";
import { toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";

export function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultShowReply,
  draftMessage,
  expanded,
  onToggle,
  onSendSuccess,
  onOpenSenderContext,
  generateNudge,
}: {
  message: ThreadMessage;
  draftMessage?: ThreadMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  expanded: boolean;
  /** Absent when the thread has a single message, which never collapses. */
  onToggle?: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onOpenSenderContext?: (message: ThreadMessage) => void;
  generateNudge?: boolean;
}) {
  const { emailAccountId } = useAccount();
  // `null` follows `defaultShowReply`, which the reader's Reply button flips
  // long after this message mounted.
  const [replyOverride, setReplyOverride] = useState<boolean | null>(null);
  const showReply = replyOverride ?? Boolean(defaultShowReply);

  const [showDetails, setShowDetails] = useState(false);
  const [showForward, setShowForward] = useState(false);

  const onReply = useCallback(() => setReplyOverride(true), []);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setReplyOverride(false);
    setShowForward(false);
  }, []);

  const toggleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails((prev) => !prev);
  }, []);

  return (
    <li className="group/message border-border/60 border-t py-4 first:border-t-0 first:pt-0">
      <MessageHeader
        expanded={expanded}
        message={message}
        onForward={onForward}
        onOpenSenderContext={onOpenSenderContext}
        onReply={onReply}
        onToggle={onToggle}
        showDetails={showDetails}
        showReplyButton={showReplyButton}
        toggleDetails={toggleDetails}
      />

      {expanded && (
        // Aligns the body with the sender's name rather than the avatar.
        <div className="min-w-0 pt-3 pl-9">
          {showDetails && <EmailDetails message={message} />}

          {message.textHtml ? (
            <HtmlEmail
              emailAccountId={emailAccountId}
              html={message.textHtml}
              inlineAttachments={message.inline}
              messageId={message.id}
            />
          ) : (
            <PlainEmail text={message.textPlain || ""} />
          )}

          {message.attachments && <EmailAttachments message={message} />}

          {(showReply || showForward) && (
            <ReplyPanel
              defaultShowReply={defaultShowReply}
              draftMessage={draftMessage}
              generateNudge={generateNudge}
              message={message}
              onCloseCompose={onCloseCompose}
              onOpenCompose={onReply}
              onSendSuccess={onSendSuccess}
              refetch={refetch}
              showReply={showReply}
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
}) {
  const { emailAccount, emailAccountId, userEmail } = useAccount();

  const isSent = message.labelIds?.includes(GmailLabel.SENT) ?? false;
  const senderEmail = extractEmailAddress(message.headers.from);
  const senderName = isSent
    ? "Me"
    : extractNameFromEmail(message.headers.from) || senderEmail;
  const { data: contacts } = useSWR<ContactsResponse>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED && !isSent && senderEmail && emailAccountId
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
    onKeyDown: (event: React.KeyboardEvent) => {
      // Keydown bubbles, so without this the row would swallow Enter/Space
      // aimed at the buttons nested inside it.
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onToggle();
    },
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

  return (
    <div
      {...toggleProps}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onToggle && "cursor-pointer",
      )}
    >
      <Avatar aria-hidden className="size-7">
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

      {canResearchSender ? (
        <Button
          type="button"
          aria-label={`View public profile for ${senderName}`}
          className="h-7 shrink-0 gap-1 px-1.5"
          onClick={(event) => {
            event.stopPropagation();
            onOpenSenderContext?.(message);
          }}
          title="View public profile"
          variant="ghost"
        >
          <span
            className={cn(
              "truncate text-sm",
              expanded
                ? "font-semibold text-foreground"
                : "font-medium text-secondary-foreground",
            )}
          >
            {senderName}
          </span>
          <UserRoundSearchIcon className="size-3.5 text-muted-foreground" />
        </Button>
      ) : (
        <span
          className={cn(
            "shrink-0 truncate text-sm",
            expanded
              ? "font-semibold text-foreground"
              : "font-medium text-secondary-foreground",
          )}
        >
          {senderName}
        </span>
      )}

      {expanded ? (
        <>
          {senderEmail && senderEmail !== senderName ? (
            <span className="truncate text-muted-foreground text-xs">
              {senderEmail}
            </span>
          ) : null}
          <span className="shrink-0 whitespace-nowrap text-muted-foreground/70 text-xs">
            {recipientSummary(message.headers.to, userEmail)}
          </span>
          <Button
            aria-label={showDetails ? "Hide details" : "Show details"}
            className="size-6 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/message:opacity-100"
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

      <time
        className="ml-auto shrink-0 whitespace-nowrap pl-2.5 text-muted-foreground text-xs"
        dateTime={message.headers.date}
      >
        {formatShortDate(new Date(message.headers.date))}
      </time>

      {showReplyButton && (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
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
    </div>
  );
}

function ReplyPanel({
  message,
  refetch,
  onSendSuccess,
  onCloseCompose,
  onOpenCompose,
  defaultShowReply,
  showReply,
  draftMessage,
  generateNudge,
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onCloseCompose: () => void;
  onOpenCompose: () => void;
  defaultShowReply?: boolean;
  showReply: boolean;
  draftMessage?: ThreadMessage;
  generateNudge?: boolean;
}) {
  const { emailAccountId } = useAccount();

  const replyRef = useRef<HTMLDivElement>(null);

  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  // scroll to the reply panel when it first opens
  useEffect(() => {
    if (!defaultShowReply || !replyRef.current) return;

    // Wait for the reply panel layout before scrolling.
    const scrollTimeout = setTimeout(() => {
      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 500);

    return () => clearTimeout(scrollTimeout);
  }, [defaultShowReply]);

  useEffect(() => {
    async function generateReply() {
      const isSent = message.labelIds?.includes("SENT");

      // Doesn't need a nudge if it's not sent
      if (!isSent) return;

      setIsGeneratingReply(true);

      const result = await generateNudgeReplyAction(emailAccountId, {
        messages: [
          {
            id: message.id,
            textHtml: message.textHtml,
            textPlain: message.textPlain,
            date: message.headers.date,
            from: message.headers.from,
            to: message.headers.to,
            subject: message.headers.subject,
          },
        ],
      });
      if (result?.serverError) {
        console.error(result);
        setReply("");
      } else {
        setReply(result?.data?.text || "");
      }
      setIsGeneratingReply(false);
    }

    // Only generate a nudge if there's no draft message and generateNudge is true
    if (generateNudge && !draftMessage) generateReply();
  }, [generateNudge, message, draftMessage, emailAccountId]);

  const replyingToEmail: ReplyingToEmail = useMemo(() => {
    if (showReply) {
      if (draftMessage) return prepareDraftReplyEmail(draftMessage);

      // use nudge if available
      if (reply) {
        // Convert nudge text into HTML paragraphs
        const replyHtml = reply
          ? reply
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => `<p>${line}</p>`)
              .join("")
          : "";

        return prepareReplyingToEmail(message, replyHtml);
      }

      return prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [showReply, message, draftMessage, reply]);

  const { executeAsync: discardDraft } = useAction(
    deleteDraftAction.bind(null, emailAccountId),
  );

  const onDiscard = useCallback(async () => {
    if (!draftMessage) {
      onCloseCompose();
      return;
    }

    const discardPromise = discardDraft({ draftMessageId: draftMessage.id });
    onCloseCompose();

    try {
      const result = await discardPromise;
      if (result?.serverError || result?.validationErrors) {
        toastError({
          description: getActionErrorMessage(result, {
            prefix: "Failed to discard draft",
          }),
        });
        onOpenCompose();
      }
    } catch {
      toastError({ description: "Failed to discard draft" });
      onOpenCompose();
    } finally {
      refetch();
    }
  }, [draftMessage, discardDraft, onCloseCompose, onOpenCompose, refetch]);

  return (
    <Card className="mt-6 rounded-xl p-3" ref={replyRef}>
      {isGeneratingReply ? (
        <div className="flex items-center justify-center">
          <Loading />
          <MessageText>Generating reply...</MessageText>
          <Button
            className="ml-4"
            onClick={() => {
              setIsGeneratingReply(false);
            }}
            size="sm"
            variant="outline"
          >
            Skip
          </Button>
        </div>
      ) : (
        <ComposeEmailFormLazy
          onClose={onCloseCompose}
          onDiscard={onDiscard}
          onSuccess={(messageId: string, threadId: string) => {
            onSendSuccess(messageId, threadId);
            onCloseCompose();
          }}
          refetch={refetch}
          replyingToEmail={replyingToEmail}
        />
      )}
    </Card>
  );
}

/** Two letters at most: initials from a display name, or the address's first letters. */
function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
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
