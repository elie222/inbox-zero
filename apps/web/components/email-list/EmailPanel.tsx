import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { capitalCase } from "capital-case";
import { ForwardIcon, ReplyIcon, XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import { Badge } from "@/components/Badge";
import { type Thread } from "@/components/email-list/types";
import { PlanActions } from "@/components/email-list/PlanActions";
import { extractNameFromEmail } from "@/utils/email";
import { formatShortDate } from "@/utils/date";
import { PlanBadge, getActionColor } from "@/components/PlanBadge";
import { ComposeEmailFormLazy } from "@/app/(app)/compose/ComposeEmailFormLazy";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function EmailPanel(props: {
  row: Thread;
  isPlanning: boolean;
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
  const lastMessage = props.row.messages?.[props.row.messages.length - 1];

  const plan = props.row.plan;

  return (
    <div className="flex h-full flex-col overflow-y-hidden border-l border-l-gray-100">
      <div className="sticky border-b border-b-gray-100 p-4 md:flex md:items-center md:justify-between">
        <div className="md:w-0 md:flex-1">
          <h1
            id="message-heading"
            className="text-lg font-medium text-gray-900"
          >
            {lastMessage.parsedMessage.headers.subject}
          </h1>
          <p className="mt-1 truncate text-sm text-gray-500">
            {lastMessage.parsedMessage.headers.from}
          </p>
        </div>

        <div className="mt-3 flex items-center md:ml-2 md:mt-0">
          <ActionButtons
            threadId={props.row.id!}
            isPlanning={props.isPlanning}
            isCategorizing={props.isCategorizing}
            onPlanAiAction={() => props.onPlanAiAction(props.row)}
            onAiCategorize={() => props.onAiCategorize(props.row)}
            onArchive={() => {
              props.onArchive(props.row);
              props.close();
            }}
            refetch={props.refetch}
          />
          <div className="ml-2 flex items-center">
            <Tooltip content="Close">
              <button
                type="button"
                className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={props.close}
              >
                <span className="sr-only">Close</span>
                <XIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {plan?.rule && (
          <PlanExplanation
            thread={props.row}
            executePlan={props.executePlan}
            rejectPlan={props.rejectPlan}
            executingPlan={props.executingPlan}
            rejectingPlan={props.rejectingPlan}
          />
        )}
        <EmailThread messages={props.row.messages} refetch={props.refetch} />
      </div>
    </div>
  );
}

function EmailThread(props: {
  messages: Thread["messages"];
  refetch: () => void;
}) {
  return (
    <div className="grid flex-1 gap-4 overflow-auto bg-gray-100 p-4">
      <ul role="list" className="space-y-2 sm:space-y-4">
        {props.messages?.map((message) => (
          <EmailMessage
            key={message.id}
            message={message}
            refetch={props.refetch}
          />
        ))}
      </ul>
    </div>
  );
}

function EmailMessage(props: {
  message: Thread["messages"][0];
  refetch: () => void;
}) {
  const { message } = props;

  const [showReply, setShowReply] = useState(false);
  const onReply = useCallback(() => setShowReply(true), []);
  const [showForward, setShowForward] = useState(false);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setShowReply(false);
    setShowForward(false);
  }, []);

  return (
    <li className="bg-white p-4 shadow sm:rounded-lg">
      <div className="sm:flex sm:items-baseline sm:justify-between">
        <h3 className="text-base font-medium">
          <span className="text-gray-900">
            {extractNameFromEmail(message.parsedMessage.headers.from)}
          </span>{" "}
          <span className="text-gray-600">wrote</span>
        </h3>

        <div className="flex items-center space-x-2">
          <p className="mt-1 whitespace-nowrap text-sm text-gray-600 sm:ml-3 sm:mt-0">
            <time dateTime={message.parsedMessage.headers.date}>
              {formatShortDate(new Date(message.parsedMessage.headers.date))}
            </time>
          </p>
          <div className="flex items-center">
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

            {/* <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Delete this message</DropdownMenuItem>
                <DropdownMenuItem>Report spam</DropdownMenuItem>
                <DropdownMenuItem>Mark as unread</DropdownMenuItem>
                <DropdownMenuItem>Open in Gmail</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> */}
          </div>
        </div>
      </div>
      <div className="mt-4">
        {message.parsedMessage.textHtml ? (
          <HtmlEmail html={message.parsedMessage.textHtml} />
        ) : (
          <PlainEmail text={message.parsedMessage.textPlain || ""} />
        )}
      </div>

      {(showReply || showForward) && (
        <>
          <Separator className="my-4" />

          <div className="">
            <ComposeEmailFormLazy
              replyingToEmail={
                showReply
                  ? {
                      to: message.parsedMessage.headers.from,
                      subject: `Re: ${message.parsedMessage.headers.subject}`,
                      headerMessageId:
                        message.parsedMessage.headers["message-id"]!,
                      threadId: message.threadId!,
                      cc: message.parsedMessage.headers.cc,
                      references: message.parsedMessage.headers.references,
                    }
                  : {
                      to: "",
                      subject: `Fwd: ${message.parsedMessage.headers.subject}`,
                      headerMessageId: "",
                      threadId: message.threadId!,
                      cc: "",
                      references: "",
                    }
              }
              novelEditorClassName="h-40 overflow-auto"
              refetch={props.refetch}
              onSuccess={onCloseCompose}
              onDiscard={onCloseCompose}
            />
          </div>
        </>
      )}
    </li>
  );
}

export function HtmlEmail(props: { html: string }) {
  const srcDoc = useMemo(() => getIframeHtml(props.html), [props.html]);

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement, Event>) => {
      if (event.currentTarget.contentWindow) {
        // sometimes we see minimal scrollbar, so add a buffer
        const BUFFER = 5;

        event.currentTarget.style.height =
          event.currentTarget.contentWindow.document.documentElement
            .scrollHeight +
          BUFFER +
          "px";
      }
    },
    [],
  );

  return <iframe srcDoc={srcDoc} onLoad={onLoad} className="h-full w-full" />;
}

function PlainEmail(props: { text: string }) {
  return <pre className="whitespace-pre-wrap">{props.text}</pre>;
}

function getIframeHtml(html: string) {
  let htmlWithFontFamily = "";
  // Set font to sans-serif if font not set
  if (html.indexOf("font-family") === -1) {
    htmlWithFontFamily = `<style>* { font-family: sans-serif; }</style>${html}`;
  } else {
    htmlWithFontFamily = html;
  }

  let htmlWithHead = "";

  // Open all links in a new tab
  if (htmlWithFontFamily.indexOf("</head>") === -1) {
    htmlWithHead = `<head><base target="_blank"></head>${htmlWithFontFamily}`;
  } else {
    htmlWithHead = htmlWithFontFamily.replace(
      "</head>",
      `<base target="_blank"></head>`,
    );
  }

  return htmlWithHead;
}

function PlanExplanation(props: {
  thread: Thread;
  executingPlan: boolean;
  rejectingPlan: boolean;
  executePlan: (thread: Thread) => Promise<void>;
  rejectPlan: (thread: Thread) => Promise<void>;
}) {
  const { thread } = props;

  if (!thread) return null;

  const { plan } = thread;

  if (!plan?.rule) return null;

  return (
    <div className="max-h-48 overflow-auto border-b border-b-gray-100 bg-gradient-to-r from-purple-50 via-blue-50 to-green-50 p-4 text-gray-900">
      <div className="flex">
        <div className="flex-shrink-0">
          <PlanBadge plan={plan} />
        </div>
        <div className="ml-2">{plan.databaseRule?.instructions}</div>
      </div>
      <div className="mt-4 flex space-x-1">
        {plan.rule.actions?.map((action, i) => {
          return (
            <div key={i}>
              <Badge color={getActionColor(action.type)}>
                {capitalCase(action.type)}
              </Badge>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        {Object.entries(plan.functionArgs).map(([key, value]) => {
          return (
            <div key={key}>
              <strong>{capitalCase(key)}: </strong>
              <span className="whitespace-pre-wrap">{value as string}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2">
        <PlanActions
          thread={thread}
          executePlan={props.executePlan}
          rejectPlan={props.rejectPlan}
          executingPlan={props.executingPlan}
          rejectingPlan={props.rejectingPlan}
        />
      </div>
    </div>
  );
}
