import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ForwardIcon,
  ReplyIcon,
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
import { generateNudgeAction } from "@/utils/actions/generate-reply";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";

export function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultShowReply,
  draftReply,
  expanded,
  onExpand,
  onSendSuccess,
  generateNudge,
}: {
  message: ThreadMessage;
  draftReply?: ThreadMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSendSuccess: (messageId: string) => void;
  generateNudge?: boolean;
}) {
  const [showReply, setShowReply] = useState(defaultShowReply || false);
  const replyRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (defaultShowReply && replyRef.current) {
      setTimeout(() => {
        replyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        // NOTE: a little hacky
        // If this is set lower it doesn't work (or if we turn off autofocus, it does, but we want autofocus).
      }, 500);
    }
  }, [defaultShowReply]);

  const onReply = useCallback(() => setShowReply(true), []);
  const [showForward, setShowForward] = useState(false);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setShowReply(false);
    setShowForward(false);
  }, []);

  useEffect(() => {
    async function loadNudge() {
      const result = await generateNudgeAction({
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

      console.log("🚀 ~ result:", result);
    }

    if (generateNudge) loadNudge();
  }, [generateNudge, message]);

  const replyingToEmail: ReplyingToEmail = useMemo(() => {
    if (showReply) {
      if (draftReply) return prepareDraftReplyEmail(draftReply);
      return prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [showReply, message, draftReply]);

  const toggleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails((prev) => !prev);
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <li
      className={cn(
        "bg-white p-4 shadow sm:rounded-lg",
        !expanded && "cursor-pointer",
      )}
      onClick={onExpand}
    >
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <h3 className="text-base font-medium">
              <span className="text-gray-900">
                {extractNameFromEmail(message.headers.from)}
              </span>{" "}
              <span className="text-gray-600">wrote</span>
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
          <p className="mt-1 whitespace-nowrap text-sm text-gray-600 sm:ml-3 sm:mt-0">
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

      {expanded && (
        <>
          {showDetails && <EmailDetails message={message} />}

          {message.textHtml ? (
            <HtmlEmail html={message.textHtml} />
          ) : (
            <PlainEmail text={message.textPlain || ""} />
          )}

          {message.attachments && <EmailAttachments message={message} />}

          {(showReply || showForward) && (
            <>
              <Separator className="my-4" />

              <div ref={replyRef}>
                <ComposeEmailFormLazy
                  replyingToEmail={replyingToEmail}
                  refetch={refetch}
                  onSuccess={(messageId) => {
                    onSendSuccess(messageId);
                    onCloseCompose();
                  }}
                  onDiscard={onCloseCompose}
                />
              </div>
            </>
          )}
        </>
      )}
    </li>
  );
}

const prepareReplyingToEmail = (message: ParsedMessage): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : `Re: ${message.headers.subject}`,
    headerMessageId: message.headers["message-id"]!,
    threadId: message.threadId!,
    // Keep original CC
    cc: message.headers.cc,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: message.headers.references,
    draftHtml: "",
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

function prepareDraftReplyEmail(message: ParsedMessage): ReplyingToEmail {
  const splitHtml = extractEmailReply(message.textHtml || "");

  return {
    to: message.headers.to,
    subject: message.headers.subject,
    headerMessageId: message.headers["message-id"]!,
    threadId: message.threadId!,
    cc: message.headers.cc,
    bcc: message.headers.bcc,
    references: message.headers.references,
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
  };
}
