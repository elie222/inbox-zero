import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ForwardIcon,
  ReplyIcon,
  ReplyAllIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
} from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { extractNameFromEmail } from "@/utils/email";
import { formatShortDate } from "@/utils/date";
import { ComposeEmailFormLazy } from "@/app/(app)/compose/ComposeEmailFormLazy";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ParsedMessage } from "@/utils/types";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { extractEmailReply } from "@/utils/parse/extract-reply.client";
import type { ReplyingToEmail } from "@/app/(app)/compose/ComposeEmailForm";
import { createReplyContent } from "@/utils/gmail/reply";
import { cn } from "@/utils";
import { generateReplyAction } from "@/utils/actions/generate-reply";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";
import { isActionError } from "@/utils/error";
import { Loading } from "@/components/Loading";
import { MessageText } from "@/components/Typography";

export function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultShowReply,
  draftMessage,
  expanded,
  onExpand,
  onSendSuccess,
  generateNudge,
}: {
  message: ThreadMessage;
  draftMessage?: ThreadMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  generateNudge?: boolean;
}) {
  const [showReply, setShowReply] = useState(defaultShowReply || false);
  const [showReplyAll, setShowReplyAll] = useState(false); // New state for "Reply to All"
  const [showDetails, setShowDetails] = useState(false);

  const onReply = useCallback(() => setShowReply(true), []);
  const onReplyAll = useCallback(() => setShowReplyAll(true), []); // New callback for "Reply to All"
  const [showForward, setShowForward] = useState(false);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setShowReply(false);
    setShowReplyAll(false); // Reset "Reply to All" state
    setShowForward(false);
  }, []);

  const toggleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails((prev) => !prev);
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <li
      className={cn(
        "bg-background p-4 shadow sm:rounded-lg",
        !expanded && "cursor-pointer",
      )}
      onClick={onExpand}
    >
      <TopBar
        message={message}
        expanded={expanded}
        showDetails={showDetails}
        toggleDetails={toggleDetails}
        showReplyButton={showReplyButton}
        onReply={onReply}
        onReplyAll={onReplyAll} // Pass the "Reply to All" callback
        onForward={onForward}
      />

      {expanded && (
        <>
          {showDetails && <EmailDetails message={message} />}

          {message.textHtml ? (
            <HtmlEmail html={message.textHtml} />
          ) : (
            <PlainEmail text={message.textPlain || ""} />
          )}

          {message.attachments && <EmailAttachments message={message} />}

          {(showReply || showReplyAll || showForward) && (
            <ReplyPanel
              message={message}
              refetch={refetch}
              onSendSuccess={onSendSuccess}
              onCloseCompose={onCloseCompose}
              defaultShowReply={defaultShowReply}
              showReply={showReply || showReplyAll} // Pass the combined state
              draftMessage={draftMessage}
              generateNudge={generateNudge}
              replyToAll={showReplyAll} // Pass the "Reply to All" state
            />
          )}
        </>
      )}
    </li>
  );
}

function TopBar({
  message,
  expanded,
  showDetails,
  toggleDetails,
  showReplyButton,
  onReply,
  onForward,
  onReplyAll, // New prop for handling "Reply to All"
}: {
  message: ParsedMessage;
  expanded: boolean;
  showDetails: boolean;
  toggleDetails: (e: React.MouseEvent) => void;
  showReplyButton: boolean;
  onReply: () => void;
  onForward: () => void;
  onReplyAll: () => void; // New prop for handling "Reply to All"
}) {
  return (
    <div className="sm:flex sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <h3 className="text-base font-medium">
            <span className="text-foreground">
              {message.labelIds?.includes("SENT")
                ? "Me"
                : extractNameFromEmail(message.headers.from)}
            </span>{" "}
            {expanded && <span className="text-muted-foreground">wrote</span>}
          </h3>
        </div>
        {expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={toggleDetails}
          >
            {showDetails ? (
              <ChevronsDownUpIcon className="size-4" />
            ) : (
              <ChevronsUpDownIcon className="size-4" />
            )}
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <p className="mt-1 whitespace-nowrap text-sm text-muted-foreground sm:ml-3 sm:mt-0">
          <time dateTime={message.headers.date}>
            {formatShortDate(new Date(message.headers.date))}
          </time>
        </p>
        {showReplyButton && (
          <div className="relative flex items-center">
            <Tooltip content="Reply">
              <Button variant="ghost" size="icon" onClick={onReply}>
                <ReplyIcon className="h-4 w-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </Tooltip>
            <Tooltip content="Reply to All">
              <Button variant="ghost" size="icon" onClick={onReplyAll}>
                <ReplyAllIcon className="h-4 w-4" />
                <span className="sr-only">Reply to All</span>
              </Button>
            </Tooltip>
            <Tooltip content="Forward">
              <Button variant="ghost" size="icon">
                <ForwardIcon className="h-4 w-4" onClick={onForward} />
                <span className="sr-only">Forward</span>
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyPanel({
  message,
  refetch,
  onSendSuccess,
  onCloseCompose,
  defaultShowReply,
  showReply,
  draftMessage,
  generateNudge,
  replyToAll, // New prop for "Reply to All"
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onCloseCompose: () => void;
  defaultShowReply?: boolean;
  showReply: boolean;
  draftMessage?: ThreadMessage;
  generateNudge?: boolean;
  replyToAll?: boolean; // New prop for "Reply to All"
}) {
  const replyRef = useRef<HTMLDivElement>(null);

  const [isGeneratingNudge, setIsGeneratingNudge] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);

  // Scroll to the reply panel when it first opens
  useEffect(() => {
    if (defaultShowReply && replyRef.current) {
      setTimeout(() => {
        replyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 500);
    }
  }, [defaultShowReply]);

  // Generate nudge if enabled
  useEffect(() => {
    async function loadNudge() {
      setIsGeneratingNudge(true);

      const isSent = message.labelIds?.includes("SENT");

      const result = await generateReplyAction({
        type: isSent ? "nudge" : "reply",
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
      if (isActionError(result)) {
        console.error(result);
        setNudge("");
      } else {
        setNudge(result.text);
      }
      setIsGeneratingNudge(false);
    }

    if (generateNudge) loadNudge();
  }, [generateNudge, message]);

  // Prepare the email for replying or forwarding
  const replyingToEmail: ReplyingToEmail = useMemo(() => {
    if (showReply) {
      if (draftMessage) return prepareDraftReplyEmail(draftMessage);

      // Use nudge if available
      if (nudge) {
        const nudgeHtml = nudge
          ? nudge
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => `<p>${line}</p>`)
              .join("")
          : "";

        return replyToAll
          ? prepareReplyToAllEmail(message, nudgeHtml) // Use "Reply to All" logic
          : prepareReplyingToEmail(message, nudgeHtml);
      }

      return replyToAll
        ? prepareReplyToAllEmail(message) // Use "Reply to All" logic
        : prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [showReply, message, draftMessage, nudge, replyToAll]);

  return (
    <>
      <Separator className="my-4" />

      <div ref={replyRef}>
        {isGeneratingNudge ? (
          <div className="flex items-center justify-center">
            <Loading />
            <MessageText>Generating reply...</MessageText>
            <Button
              className="ml-4"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsGeneratingNudge(false);
              }}
            >
              Skip
            </Button>
          </div>
        ) : (
          <ComposeEmailFormLazy
            replyingToEmail={replyingToEmail}
            refetch={refetch}
            onSuccess={(messageId, threadId) => {
              onSendSuccess(messageId, threadId);
              onCloseCompose();
            }}
            onDiscard={onCloseCompose}
          />
        )}
      </div>
    </>
  );
}

const prepareReplyingToEmail = (
  message: ParsedMessage,
  content = "",
  replyToAll = false, // New parameter to handle "Reply to All"
): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    // If replying to all, include CC recipients
    cc: replyToAll ? message.headers.cc : "",
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : `Re: ${message.headers.subject}`,
    headerMessageId: message.headers["message-id"]!,
    threadId: message.threadId!,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: message.headers.references,
    draftHtml: content || "",
    quotedContentHtml: html,
  };
};

const prepareReplyToAllEmail = (
  message: ParsedMessage,
  content = "",
): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    // Include all CC recipients
    cc: message.headers.cc,
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : `Re: ${message.headers.subject}`,
    headerMessageId: message.headers["message-id"]!,
    threadId: message.threadId!,
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
  headerMessageId: "",
  threadId: message.threadId!,
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
    headerMessageId: draft.headers["message-id"]!,
    threadId: draft.threadId!,
    cc: draft.headers.cc,
    bcc: draft.headers.bcc,
    references: draft.headers.references,
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
  };
}
