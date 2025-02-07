import {
  type SyntheticEvent,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import Link from "next/link";
import {
  DownloadIcon,
  ForwardIcon,
  ReplyIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
} from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { extractNameFromEmail } from "@/utils/email";
import { formatShortDate } from "@/utils/date";
import { ComposeEmailFormLazy } from "@/app/(app)/compose/ComposeEmailFormLazy";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/Card";
import type { ParsedMessage } from "@/utils/types";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { Loading } from "@/components/Loading";
import { extractEmailReply } from "@/utils/parse/extract-reply.client";
import type { ReplyingToEmail } from "@/app/(app)/compose/ComposeEmailForm";
import { createReplyContent } from "@/utils/gmail/reply";
import { cn } from "@/utils";

type EmailMessage = Thread["messages"][number];

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
}: {
  messages: EmailMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
}) {
  // Place draft messages as replies to their parent message
  const organizedMessages = useMemo(() => {
    const drafts = new Map<string, EmailMessage>();
    const regularMessages: EmailMessage[] = [];

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
      draftReply: drafts.get(message.headers["message-id"] || ""),
    }));
  }, [messages]);

  const lastMessageId = organizedMessages.at(-1)?.message.id;

  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    new Set(lastMessageId ? [lastMessageId] : []),
  );

  return (
    <div className="grid flex-1 gap-4 overflow-auto bg-gray-100 p-4">
      <div className="text-2xl font-semibold text-gray-900">
        {messages[0]?.headers.subject}
      </div>
      <ul className="space-y-2 sm:space-y-4">
        {organizedMessages.map(({ message, draftReply }) => (
          <EmailMessage
            key={message.id}
            message={message}
            showReplyButton={showReplyButton}
            refetch={refetch}
            defaultShowReply={
              autoOpenReplyForMessageId === message.id || Boolean(draftReply)
            }
            draftReply={draftReply}
            expanded={expandedMessageIds.has(message.id)}
            onExpand={() => {
              setExpandedMessageIds((prev) => {
                if (prev.has(message.id)) return prev;
                return new Set(prev).add(message.id);
              });
            }}
            onSendSuccess={(messageId) => {
              setExpandedMessageIds((prev) => {
                if (prev.has(messageId)) return prev;
                return new Set(prev).add(messageId);
              });
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultShowReply,
  draftReply,
  expanded,
  onExpand,
  onSendSuccess,
}: {
  message: EmailMessage;
  draftReply?: EmailMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSendSuccess: (messageId: string) => void;
}) {
  const [showReply, setShowReply] = useState(defaultShowReply || false);
  const replyRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (defaultShowReply && replyRef.current) {
      setTimeout(() => {
        replyRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  }, [defaultShowReply]);

  const onReply = useCallback(() => setShowReply(true), []);
  const [showForward, setShowForward] = useState(false);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setShowReply(false);
    setShowForward(false);
  }, []);

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

          {message.attachments && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {message.attachments.map((attachment) => {
                const url = `/api/google/messages/attachment?messageId=${message.id}&attachmentId=${attachment.attachmentId}&mimeType=${attachment.mimeType}&filename=${attachment.filename}`;

                return (
                  <Card key={attachment.filename}>
                    <div className="text-gray-600">{attachment.filename}</div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-gray-600">
                        {mimeTypeToString(attachment.mimeType)}
                      </div>
                      <Button variant="outline" asChild>
                        <Link href={url} target="_blank">
                          <>
                            <DownloadIcon className="mr-2 h-4 w-4" />
                            Download
                          </>
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

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

export function HtmlEmail({ html }: { html: string }) {
  const srcDoc = useMemo(() => getIframeHtml(html), [html]);
  const [isLoading, setIsLoading] = useState(true);

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement, Event>) => {
      if (event.currentTarget.contentWindow) {
        // sometimes we see minimal scrollbar, so add a buffer
        const BUFFER = 5;

        const height = `${
          event.currentTarget.contentWindow.document.documentElement
            .scrollHeight + BUFFER
        }px`;

        event.currentTarget.style.height = height;
        setIsLoading(false);
      }
    },
    [],
  );

  return (
    <div>
      {isLoading && <Loading />}
      <iframe
        srcDoc={srcDoc}
        onLoad={onLoad}
        className="h-0 min-h-0 w-full"
        title="Email content preview"
      />
    </div>
  );
}

function PlainEmail({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap">{text}</pre>;
}

function getIframeHtml(html: string) {
  // Always inject our default font styles with lower specificity
  // This ensures styled elements keep their fonts while unstyled ones get our defaults
  const defaultFontStyles = `
    <style>
      /* Base styles with low specificity */
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
      }
    </style>
  `;

  let htmlWithHead = "";
  if (html.indexOf("</head>") === -1) {
    htmlWithHead = `<head>${defaultFontStyles}<base target="_blank"></head>${html}`;
  } else {
    htmlWithHead = html.replace(
      "</head>",
      `${defaultFontStyles}<base target="_blank" rel="noopener noreferrer"></head>`,
    );
  }

  return htmlWithHead;
}

function mimeTypeToString(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/zip":
      return "ZIP";
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    // LLM generated. Need to check they're actually needed
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "XLSX";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "PPTX";
    case "application/vnd.ms-excel":
      return "XLS";
    case "application/vnd.ms-powerpoint":
      return "PPT";
    case "application/vnd.ms-word":
      return "DOC";
    default:
      return mimeType;
  }
}

const prepareReplyingToEmail = (message: ParsedMessage): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  const splitHtml = extractEmailReply(html);

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
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
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

function EmailDetails({ message }: { message: EmailMessage }) {
  const details = [
    { label: "From", value: message.headers.from },
    { label: "To", value: message.headers.to },
    { label: "CC", value: message.headers.cc },
    { label: "BCC", value: message.headers.bcc },
    {
      label: "Date",
      value: new Date(message.headers.date).toLocaleString(),
    },
    // { label: "Subject", value: message.headers.subject },
  ];

  return (
    <div className="mb-4 rounded-md bg-gray-50 p-3 text-sm">
      <div className="grid gap-1">
        {details.map(
          ({ label, value }) =>
            value && (
              <div key={label} className="grid grid-cols-[auto,1fr] gap-2">
                <span className="font-medium">{label}:</span>
                <span>{value}</span>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
