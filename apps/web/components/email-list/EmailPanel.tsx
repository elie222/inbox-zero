import {
  type SyntheticEvent,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import Link from "next/link";
import { DownloadIcon, ForwardIcon, ReplyIcon, XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import {
  extractEmailAddress,
  extractNameFromEmail,
  normalizeEmailAddress,
} from "@/utils/email";
import { formatShortDate } from "@/utils/date";
import { ComposeEmailFormLazy } from "@/app/(app)/compose/ComposeEmailFormLazy";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/Card";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import type { ParsedMessage } from "@/utils/types";
import {
  forwardEmailHtml,
  forwardEmailSubject,
  forwardEmailText,
} from "@/utils/gmail/forward";
import { useIsInAiQueue } from "@/store/ai-queue";
import { Loading } from "@/components/Loading";

type EmailMessage = Thread["messages"][number];

export function EmailPanel({
  row,
  userEmail,
  isCategorizing,
  onPlanAiAction,
  onAiCategorize,
  onArchive,
  close,
  executingPlan,
  rejectingPlan,
  executePlan,
  rejectPlan,
  refetch,
}: {
  row: Thread;
  userEmail: string;
  isCategorizing: boolean;
  onPlanAiAction: (thread: Thread) => void;
  onAiCategorize: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
  close: () => void;

  executingPlan: boolean;
  rejectingPlan: boolean;
  executePlan: (thread: Thread) => Promise<void>;
  rejectPlan: (thread: Thread) => Promise<void>;
  refetch: () => void;
}) {
  const isPlanning = useIsInAiQueue(row.id);

  const lastMessage = row.messages?.[row.messages.length - 1];

  const plan = row.plan;

  return (
    <div className="flex h-full flex-col overflow-y-hidden border-l border-l-gray-100">
      <div className="sticky border-b border-b-gray-100 p-4 md:flex md:items-center md:justify-between">
        <div className="md:w-0 md:flex-1">
          <h1
            id="message-heading"
            className="text-lg font-medium text-gray-900"
          >
            {lastMessage.headers.subject}
          </h1>
          <p className="mt-1 truncate text-sm text-gray-500">
            {lastMessage.headers.from}
          </p>
        </div>

        <div className="mt-3 flex items-center md:ml-2 md:mt-0">
          <ActionButtons
            threadId={row.id!}
            isPlanning={isPlanning}
            isCategorizing={isCategorizing}
            onPlanAiAction={() => onPlanAiAction(row)}
            onAiCategorize={() => onAiCategorize(row)}
            onArchive={() => {
              onArchive(row);
              close();
            }}
            refetch={refetch}
          />
          <Tooltip content="Close">
            <Button onClick={close} size="icon" variant="ghost">
              <span className="sr-only">Close</span>
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {plan?.rule && (
          <PlanExplanation
            thread={row}
            executePlan={executePlan}
            rejectPlan={rejectPlan}
            executingPlan={executingPlan}
            rejectingPlan={rejectingPlan}
          />
        )}
        <EmailThread
          messages={row.messages}
          refetch={refetch}
          showReplyButton
          userEmail={userEmail}
        />
      </div>
    </div>
  );
}

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  userEmail,
}: {
  messages: EmailMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  userEmail: string;
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

  return (
    <div className="grid flex-1 gap-4 overflow-auto bg-gray-100 p-4">
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
            userEmail={userEmail}
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
  userEmail,
}: {
  message: EmailMessage;
  draftReply?: EmailMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  userEmail: string;
}) {
  const [showReply, setShowReply] = useState(defaultShowReply || false);
  const replyRef = useRef<HTMLDivElement>(null);

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

  const prepareReplyingToEmail = useCallback(
    (message: ParsedMessage) => {
      const normalizedFrom = normalizeEmailAddress(
        extractEmailAddress(message.headers.from),
      );
      const normalizedUserEmail = normalizeEmailAddress(userEmail);
      const sentFromUser = normalizedFrom === normalizedUserEmail;

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
        messageText: "",
        messageHtml: "",
      };
    },
    [userEmail],
  );

  const prepareForwardingEmail = useCallback(
    (message: ParsedMessage) => ({
      to: "",
      subject: forwardEmailSubject(message.headers.subject),
      headerMessageId: "",
      threadId: message.threadId!,
      cc: "",
      references: "",
      messageText: forwardEmailText({ content: "", message }),
      messageHtml: forwardEmailHtml({ content: "", message }),
    }),
    [],
  );

  const replyingToEmail = useMemo(() => {
    if (showReply) {
      if (draftReply) {
        return {
          to: draftReply.headers.to,
          subject: draftReply.headers.subject,
          headerMessageId: draftReply.headers["message-id"]!,
          threadId: message.threadId!,
          cc: draftReply.headers.cc,
          bcc: draftReply.headers.bcc,
          references: draftReply.headers.references,
          messageText: draftReply.textPlain || "",
          messageHtml: draftReply.textHtml || "",
          draftId: draftReply.id,
        };
      }
      return prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [
    showReply,
    message,
    draftReply,
    prepareForwardingEmail,
    prepareReplyingToEmail,
  ]);

  return (
    <li className="bg-white p-4 shadow sm:rounded-lg">
      <div className="sm:flex sm:items-baseline sm:justify-between">
        <h3 className="text-base font-medium">
          <span className="text-gray-900">
            {extractNameFromEmail(message.headers.from)}
          </span>{" "}
          <span className="text-gray-600">wrote</span>
        </h3>

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
      <div className="mt-4">
        {message.textHtml ? (
          <HtmlEmail html={message.textHtml} />
        ) : (
          <PlainEmail text={message.textPlain || ""} />
        )}
      </div>
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
              onSuccess={onCloseCompose}
              onDiscard={onCloseCompose}
            />
          </div>
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
