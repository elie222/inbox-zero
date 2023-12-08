import { type SyntheticEvent, useCallback, useMemo } from "react";
import { capitalCase } from "capital-case";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import { Badge } from "@/components/Badge";
import { SendEmailForm } from "@/components/email-list/SendEmailForm";
import { type Thread } from "@/components/email-list/types";
import { PlanActions } from "@/components/email-list/PlanActions";
import { extractNameFromEmail } from "@/utils/email";
import { formatShortDate } from "@/utils/date";

export function EmailPanel(props: {
  row: Thread;
  showReply: boolean;
  onShowReply: () => void;
  isPlanning: boolean;
  isCategorizing: boolean;
  isArchiving: boolean;
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

  const showReply = props.showReply;
  const showThread = props.row.messages?.length > 1;

  const plan = props.row.plan;

  return (
    <div className="flex flex-col overflow-y-hidden border-l border-l-gray-100">
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
            onReply={props.onShowReply}
            isPlanning={props.isPlanning}
            isCategorizing={props.isCategorizing}
            isArchiving={props.isArchiving}
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
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
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
        {showThread ? (
          <EmailThread messages={props.row.messages} />
        ) : lastMessage.parsedMessage.textHtml ? (
          <HtmlEmail html={lastMessage.parsedMessage.textHtml} />
        ) : (
          <EmailThread messages={props.row.messages} />
        )}
        {showReply && (
          <div className="h-64 shrink-0 border-t border-t-gray-100">
            <SendEmailForm
              threadId={props.row.id!}
              // defaultMessage={props.row.plan?.response || ""}
              defaultMessage={""}
              subject={lastMessage.parsedMessage.headers.subject}
              to={lastMessage.parsedMessage.headers.from}
              cc={lastMessage.parsedMessage.headers.cc}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmailThread(props: { messages: Thread["messages"] }) {
  return (
    <div className="grid flex-1 gap-4 overflow-auto bg-gray-100 p-4">
      <ul role="list" className="space-y-2 sm:space-y-4">
        {props.messages?.map((message) => (
          <li
            key={message.id}
            className="bg-white px-4 py-6 shadow sm:rounded-lg sm:px-6"
          >
            <div className="sm:flex sm:items-baseline sm:justify-between">
              <h3 className="text-base font-medium">
                <span className="text-gray-900">
                  {extractNameFromEmail(message.parsedMessage.headers.from)}
                </span>{" "}
                <span className="text-gray-600">wrote</span>
              </h3>
              <p className="mt-1 whitespace-nowrap text-sm text-gray-600 sm:ml-3 sm:mt-0">
                <time dateTime={message.parsedMessage.headers.date}>
                  {formatShortDate(
                    new Date(message.parsedMessage.headers.date),
                  )}
                </time>
              </p>
            </div>
            <div className="mt-4">
              {message.parsedMessage.textHtml ? (
                <HtmlEmail html={message.parsedMessage.textHtml} />
              ) : (
                <PlainEmail text={message.parsedMessage.textPlain || ""} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HtmlEmail(props: { html: string }) {
  const srcDoc = useMemo(() => getIframeHtml(props.html), [props.html]);

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement, Event>) => {
      if (event.currentTarget.contentWindow) {
        event.currentTarget.style.height =
          event.currentTarget.contentWindow.document.documentElement
            .scrollHeight +
          5 +
          "px"; // +5 to give a bit of extra space to avoid scrollbar
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
    <div className="border-b border-b-gray-100 bg-gradient-to-r from-purple-50 via-blue-50 to-green-50 p-4 text-gray-900">
      <div className="flex">
        <div className="flex-shrink-0">
          <Badge color="green">{plan.rule.name}</Badge>
        </div>
        <div className="ml-2">{plan.databaseRule?.instructions}</div>
      </div>
      <div className="mt-4 flex space-x-1">
        {plan.rule.actions?.map((action, i) => {
          return (
            <div key={i}>
              <Badge color="green">{capitalCase(action.type)}</Badge>
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
