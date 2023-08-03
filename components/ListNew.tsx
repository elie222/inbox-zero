import {
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { capitalCase } from "capital-case";
import clsx from "clsx";
import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";
import { useSearchParams } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { Card } from "@tremor/react";
import { PlanBody, PlanResponse } from "@/app/api/ai/plan/controller";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/controller";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { ActionButtons } from "@/components/ActionButtons";
import { Badge, Color } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Celebration } from "@/components/Celebration";
// import { Checkbox } from "@/components/Checkbox";
import { GroupHeading } from "@/components/GroupHeading";
import { Input } from "@/components/Input";
import { LoadingMiniSpinner } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { Tabs } from "@/components/Tabs";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { useGmail } from "@/providers/GmailProvider";
import { fetcher } from "@/providers/SWRProvider";
import { labelThreadsAction } from "@/utils/actions";
import { postRequest } from "@/utils/api";
import { formatShortDate } from "@/utils/date";
import { isErrorMessage } from "@/utils/error";
import { FilterArgs, FilterFunction } from "@/utils/ai/filters";
import { type Plan } from "@/utils/redis/plan";
import { ParsedMessage } from "@/utils/types";
import { useSession } from "next-auth/react";
import { SendEmailBody, SendEmailResponse } from "@/utils/gmail/mail";
import { ActResponse } from "@/app/api/ai/act/controller";
import { ActBody } from "@/app/api/ai/act/validation";

type Thread = ThreadsResponse["threads"][number];

export function List(props: {
  emails: Thread[];
  prompt?: string;
  filter?: FilterFunction;
  filterArgs?: FilterArgs;
  refetch: () => void;
}) {
  const { emails: filteredEmails, filter, filterArgs } = props;
  // const filteredEmails = useMemo(() => {
  //   if (!filter) return emails;

  //   return emails.filter((email) =>
  //     filter({ ...(email.plan || {}), threadId: email.id! }, filterArgs)
  //   );
  // }, [emails, filter, filterArgs]);

  const { labelsArray } = useGmail();
  const label = useMemo(() => {
    return labelsArray.find((label) => label.name === props.filterArgs?.label);
  }, [labelsArray, props.filterArgs?.label]);

  const params = useSearchParams();
  const searchParamAction = params.get("action") || "";
  const searchParamLabel = params.get("label") || "";

  const selectedTab = useMemo(() => {
    if (!searchParamAction) return "all";
    return `${searchParamAction}---${searchParamLabel}`;
  }, [searchParamAction, searchParamLabel]);

  const tabGroups = useMemo(() => {
    return groupBy(
      filteredEmails
      // filteredEmails.filter((e) => e.plan?.action),
      // (e) => `${e.plan?.action}---${e.plan?.label || ""}`
    );
  }, [filteredEmails]);

  const tabs = useMemo(() => {
    return [
      { label: "All", value: "all", href: "/mail" },
      ...sortBy(
        Object.keys(tabGroups).map((value) => {
          const count = tabGroups[value].length;
          const parts = value.split("---");
          const action = parts[0];
          const label = parts[1];

          return {
            label: `${capitalCase(action)}${
              label ? ` ${label}` : ""
            } (${count})`,
            value,
            href: `?action=${action}&label=${label}`,
            sortKey: label || "",
          };
        }),
        (t) => t.sortKey
      ),
    ];
  }, [tabGroups]);

  const tabEmails = useMemo(() => {
    if (!selectedTab || selectedTab === "all") return filteredEmails;
    return tabGroups[selectedTab] || filteredEmails;
  }, [selectedTab, filteredEmails, tabGroups]);

  const [replanningAiSuggestions, setReplanningAiSuggestions] = useState(false);
  const [applyingAiSuggestions, setApplyingAiSuggestions] = useState(false);

  return (
    <>
      <div className="border-b border-gray-200">
        <GroupHeading
          leftContent={
            <div className="overflow-x-auto py-2 md:max-w-lg lg:max-w-xl xl:max-w-3xl 2xl:max-w-4xl">
              <Tabs selected={selectedTab} tabs={tabs} breakpoint="md" />
            </div>
          }
          buttons={
            label
              ? [
                  {
                    label: "Label All",
                    onClick: async () => {
                      try {
                        await labelThreadsAction({
                          labelId: label?.id!,
                          threadIds: tabEmails.map((email) => email.id!),
                          archive: false,
                        });
                        toastSuccess({
                          description: `Labeled emails "${label.name}".`,
                        });
                      } catch (error) {
                        toastError({
                          description: `There was an error labeling emails "${label.name}".`,
                        });
                      }
                    },
                  },
                  {
                    label: "Label + Archive All",
                    onClick: async () => {
                      try {
                        await labelThreadsAction({
                          labelId: label?.id!,
                          threadIds: tabEmails.map((email) => email.id!),
                          archive: true,
                        });
                        toastSuccess({
                          description: `Labeled and archived emails "${label.name}".`,
                        });
                      } catch (error) {
                        toastError({
                          description: `There was an error labeling and archiving emails "${label.name}".`,
                        });
                      }
                    },
                  },
                ]
              : [
                  {
                    label: "Replan All",
                    onClick: async () => {
                      setReplanningAiSuggestions(true);
                      try {
                        for (const email of tabEmails) {
                          if (!email.plan) continue;

                          const emailMessage = email.thread.messages?.[0];
                          const subject =
                            emailMessage?.parsedMessage.headers.subject || "";
                          const message =
                            emailMessage?.parsedMessage.textPlain ||
                            emailMessage?.parsedMessage.textHtml ||
                            "";

                          const senderEmail =
                            emailMessage?.parsedMessage.headers.from || "";

                          try {
                            // had trouble with server actions here
                            const res = await postRequest<
                              PlanResponse,
                              PlanBody
                            >("/api/ai/plan", {
                              id: email.id!,
                              subject,
                              message,
                              senderEmail,
                              replan: true,
                            });

                            if (isErrorMessage(res)) {
                              console.error(res);
                              toastError({
                                description: `Error planning  ${subject}`,
                              });
                            }
                          } catch (error) {
                            console.error(error);
                            toastError({
                              description: `Error archiving ${subject}`,
                            });
                          }
                        }
                      } catch (error) {
                        toastError({
                          description: `There was an error applying the AI suggestions.`,
                        });
                      }
                      setReplanningAiSuggestions(false);
                    },
                    loading: replanningAiSuggestions,
                  },
                  {
                    label: "Apply AI Suggestions",
                    onClick: async () => {
                      setApplyingAiSuggestions(true);
                      try {
                        for (const email of tabEmails) {
                          if (!email.plan) continue;

                          const subject =
                            email.thread.messages?.[0]?.parsedMessage.headers
                              .subject || "";

                          // if (email.plan.action === "archive") {
                          //   try {
                          //     // had trouble with server actions here
                          //     const res = await postRequest<
                          //       ArchiveResponse,
                          //       ArchiveBody
                          //     >("/api/google/threads/archive", {
                          //       id: email.id!,
                          //     });

                          //     if (isErrorMessage(res)) {
                          //       console.error(res);
                          //       toastError({
                          //         description: `Error archiving  ${subject}`,
                          //       });
                          //     } else {
                          //       toastSuccess({
                          //         title: "Archvied!",
                          //         description: `Archived ${subject}`,
                          //       });
                          //     }
                          //   } catch (error) {
                          //     console.error(error);
                          //     toastError({
                          //       description: `Error archiving ${subject}`,
                          //     });
                          //   }
                          // } else if (email.plan.action === "label") {
                          //   const labelName = email.plan.label;
                          //   const label = labelsArray.find(
                          //     (label) => label.name === labelName
                          //   );
                          //   if (!label) continue;

                          //   await labelThreadsAction({
                          //     labelId: label.id,
                          //     threadIds: [email.id!],
                          //     // threadIds: tabEmails
                          //     //   .map((email) => email.id)
                          //     //   .filter(isDefined),
                          //     archive: true,
                          //   });

                          //   toastSuccess({
                          //     title: "Labelled",
                          //     description: `Labelled ${subject}`,
                          //   });
                          // }
                        }
                      } catch (error) {
                        toastError({
                          description: `There was an error applying the AI suggestions.`,
                        });
                      }
                      setApplyingAiSuggestions(false);
                    },
                    loading: applyingAiSuggestions,
                  },
                ]
          }
        />
      </div>
      {/* <div className="divide-gray-100 border-b bg-white px-4 sm:px-6 py-2 border-l-4">
        <Checkbox checked onChange={() => {}} />
      </div> */}
      {tabEmails.length ? (
        <EmailList emails={tabEmails} refetch={props.refetch} />
      ) : (
        <Celebration />
      )}
    </>
  );
}

export function EmailList(props: { emails: Thread[]; refetch: () => void }) {
  // if performance becomes an issue check this:
  // https://ianobermiller.com/blog/highlight-table-row-column-react#react-state
  // const [hovered, setHovered] = useState<Thread>();
  const [openedRow, setOpenedRow] = useState<Thread>();
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  // could make this row specific in the future
  const [showReply, setShowReply] = useState(false);

  const closePanel = useCallback(() => setOpenedRow(undefined), []);
  const onShowReply = useCallback(() => setShowReply(true), []);

  const session = useSession();

  const onSetSelectedRow = useCallback(
    (id: string) => {
      setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
    },
    [setSelectedRows]
  );

  // useEffect(() => {
  //   const down = (e: KeyboardEvent) => {
  //     if (e.key === "ArrowDown" && e.shiftKey) {
  //       setSelectedRows((s) => ({ ...s, [hovered?.id!]: true }));
  //       console.log("down");
  //     } else if (e.key === "ArrowUp") {
  //       console.log("up");
  //     }
  //   };

  //   document.addEventListener("keydown", down);
  //   return () => document.removeEventListener("keydown", down);
  // }, [hovered?.id]);

  const [isPlanning, setIsPlanning] = useState<Record<string, boolean>>({});

  const onPlanAiAction = useCallback(async (thread: Thread) => {
    setIsPlanning((s) => ({ ...s, [thread.id!]: true }));

    const message = thread.thread.messages?.[thread.thread.messages.length - 1];

    if (!message) return;

    const res = await postRequest<ActResponse, ActBody>("/api/ai/act", {
      email: {
        from: message.parsedMessage.headers.from,
        to: message.parsedMessage.headers.to,
        date: message.parsedMessage.headers.date,
        replyTo: message.parsedMessage.headers.replyTo,
        cc: message.parsedMessage.headers.cc,
        subject: message.parsedMessage.headers.subject,
        content: message.parsedMessage.textPlain,
        threadId: message.threadId || "",
        messageId: message.id || "",
        headerMessageId: message.parsedMessage.headers.messageId || "",
        references: message.parsedMessage.headers.references,
      },
      allowExecute: false,
    });

    if (isErrorMessage(res)) {
      console.error(res);
      toastError({
        description: `There was an error planning the email.`,
      });
    } else {
      // setPlan(res);
    }
    setIsPlanning((s) => ({ ...s, [thread.id!]: false }));
  }, []);

  return (
    <div
      className={clsx("h-full overflow-hidden", {
        "grid grid-cols-2": openedRow,
        "overflow-y-auto": !openedRow,
      })}
    >
      <ul role="list" className="divide-y divide-gray-100 overflow-y-auto">
        {props.emails.map((email) => (
          <EmailListItem
            key={email.id}
            userEmailAddress={session.data?.user.email || ""}
            email={email}
            opened={openedRow?.id === email.id}
            selected={selectedRows[email.id!]}
            onSelected={onSetSelectedRow}
            splitView={!!openedRow}
            onClick={() => setOpenedRow(email)}
            onShowReply={onShowReply}
            isPlanning={isPlanning[email.id!]}
            onPlanAiAction={onPlanAiAction}
            // onMouseEnter={() => setHovered(email)}
            refetchEmails={props.refetch}
          />
        ))}
      </ul>

      {!!openedRow && (
        <EmailPanel
          row={openedRow}
          showReply={showReply}
          onShowReply={onShowReply}
          isPlanning={isPlanning[openedRow.id!]}
          onPlanAiAction={onPlanAiAction}
          close={closePanel}
        />
      )}

      {/* <CommandDialogDemo selected={hovered?.id || undefined} /> */}
    </div>
  );
}

function EmailListItem(props: {
  userEmailAddress: string;
  email: Thread;
  opened: boolean;
  selected: boolean;
  splitView: boolean;
  onClick: MouseEventHandler<HTMLLIElement>;
  onSelected: (id: string) => void;
  onShowReply: () => void;
  isPlanning: boolean;
  onPlanAiAction: (thread: Thread) => Promise<void>;
  // onMouseEnter: () => void;
  refetchEmails: () => void;
}) {
  const { email, splitView, onSelected } = props;

  const lastMessage = email.thread.messages?.[email.thread.messages.length - 1];

  const onRowSelected = useCallback(
    () => onSelected(email.id!),
    [email.id, onSelected]
  );

  return (
    <li
      className={clsx("group relative cursor-pointer border-l-4 py-3 ", {
        "hover:bg-gray-50": !props.selected,
        "bg-blue-50": props.selected,
        "border-l-blue-500 bg-gray-50": props.opened,
      })}
      onClick={props.onClick}
      // onMouseEnter={props.onMouseEnter}
    >
      <div className="px-4 sm:px-6">
        <div className="mx-auto flex justify-between">
          {/* left */}
          <div
            className={clsx(
              "flex whitespace-nowrap text-sm leading-6",
              splitView ? "w-2/3" : "w-5/6"
            )}
          >
            {/* <div className="flex items-center">
              <Checkbox checked={props.selected} onChange={onRowSelected} />
            </div> */}

            {/* <div className="ml-4 w-40 min-w-0 overflow-hidden truncate font-semibold text-gray-900"> */}
            <div className="w-40 min-w-0 overflow-hidden truncate font-semibold text-gray-900">
              {fromName(
                participant(lastMessage.parsedMessage, props.userEmailAddress)
              )}
            </div>
            {!splitView && (
              <>
                <div className="ml-4 min-w-0 overflow-hidden font-medium text-gray-700">
                  {lastMessage.parsedMessage.headers.subject}
                </div>
                <div className="ml-4 mr-6 flex flex-1 items-center overflow-hidden truncate font-normal leading-5 text-gray-500">
                  {email.snippet}
                </div>
              </>
            )}
          </div>

          {/* right */}
          <div
            className={clsx(
              "flex items-center justify-between",
              splitView ? "w-1/3" : "w-1/6"
            )}
          >
            <div className="relative flex items-center">
              <div className="absolute right-0 z-20 hidden group-hover:block">
                <ActionButtons
                  threadId={email.id!}
                  onReply={props.onShowReply}
                  onGenerateAiResponse={() => {}}
                  isPlanning={props.isPlanning}
                  onPlanAiAction={() => props.onPlanAiAction(email)}
                />
              </div>
              <div className="flex-shrink-0 text-sm font-medium leading-5 text-gray-500">
                {formatShortDate(new Date(+(lastMessage?.internalDate || "")))}
              </div>
            </div>

            <div className="ml-3 whitespace-nowrap">
              <PlanBadge
                plan={email.plan}
                id={email.id || ""}
                subject={lastMessage?.parsedMessage.headers.subject || ""}
                message={
                  lastMessage?.parsedMessage.textPlain ||
                  lastMessage?.parsedMessage.textHtml ||
                  lastMessage?.parsedMessage.headers.subject ||
                  ""
                }
                senderEmail={lastMessage?.parsedMessage.headers.from || ""}
                refetchEmails={props.refetchEmails}
              />
            </div>
          </div>
        </div>

        {splitView && (
          <div className="mt-1.5 whitespace-nowrap text-sm leading-6">
            <div className="min-w-0 overflow-hidden font-medium text-gray-700">
              {lastMessage.parsedMessage.headers.subject}
            </div>
            <div className="mr-6 mt-0.5 flex flex-1 items-center overflow-hidden truncate font-normal leading-5 text-gray-500">
              {email.snippet}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function EmailPanel(props: {
  row: Thread;
  showReply: boolean;
  onShowReply: () => void;
  isPlanning: boolean;
  onPlanAiAction: (thread: Thread) => Promise<void>;
  close: () => void;
}) {
  const lastMessage =
    props.row.thread.messages?.[props.row.thread.messages.length - 1];

  // console.log(props.row.thread.messages.map(m => m.payload?.mimeType).join(", "))
  // console.log(props.row.thread.messages.map(m => m.parsedMessage.textHtml.substring(0,50)).join("\n"))
  // console.log(props.row.thread.messages.map(m => m.parsedMessage.textPlain.substring(0,50)).join("\n"))

  // const showReply = props.showReply || props.row.plan?.action === "reply";
  const showReply = props.showReply;
  const showThread = props.row.thread.messages?.length > 1;

  return (
    <div className="flex flex-col border-l border-l-gray-100">
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
            onGenerateAiResponse={() => {}}
            isPlanning={props.isPlanning}
            onPlanAiAction={() => props.onPlanAiAction(props.row)}
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
      <div className="flex flex-1 flex-col">
        {showThread ? (
          <EmailThread messages={props.row.thread.messages} />
        ) : (
          <HtmlEmail html={lastMessage.parsedMessage.textHtml || ""} />
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

function EmailThread(props: { messages: any[] }) {
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="grid flex-1 gap-4 overflow-auto bg-gray-100 p-4">
        {props.messages?.map((message) => {
          // const html = getIframeHtml(message.parsedMessage.textHtml || "");
          // console.log("🚀 ~ file: ListNew.tsx:552 ~ {props.messages?.map ~ message.parsedMessage:", message.parsedMessage)

          return (
            <Card key={message.id}>
              <HtmlEmail html={message.parsedMessage.textHtml || ""} />
              {/* <div className="max-w-full whitespace-pre-wrap">
                {message.parsedMessage.textPlain}
              </div> */}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function HtmlEmail(props: { html: string }) {
  const srcDoc = useMemo(() => getIframeHtml(props.html), [props.html]);

  return (
    <div className="flex-1">
      <iframe srcDoc={srcDoc} className="h-full w-full" />
    </div>
  );
}

const SendEmailForm = (props: {
  threadId: string;
  defaultMessage: string;
  subject: string;
  to: string;
  cc?: string;
  replyTo?: string;
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    getValues,
  } = useForm<SendEmailBody>({
    defaultValues: {
      // threadId: props.threadId,
      messageText: props.defaultMessage,
      subject: props.subject,
      to: props.to,
      cc: props.cc,
      replyTo: props.replyTo,
    },
  });

  // useEffect(() => {
  //   if (props.threadId !== getValues("threadId")) {
  //     reset({
  //       threadId: props.threadId,
  //       messageText: props.defaultMessage,
  //       subject: props.subject,
  //       to: props.to,
  //       cc: props.cc,
  //       replyTo: props.replyTo,
  //     });
  //   }
  // }, [props, getValues, reset]);

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(async (data) => {
    try {
      const res = await postRequest<SendEmailResponse, SendEmailBody>(
        "/api/google/messages/send",
        data
      );
      if (isErrorMessage(res))
        toastError({ description: `There was an error sending the email :(` });
      else toastSuccess({ description: `Email sent!` });
    } catch (error) {
      console.error(error);
      toastError({ description: `There was an error sending the email :(` });
    }
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-4">
      <Input
        type="text"
        as="textarea"
        rows={6}
        name="messageText"
        label="Reply"
        registerProps={register("messageText", { required: true })}
        error={errors.messageText}
      />
      <div className="mt-2 flex">
        <Button type="submit" color="transparent" loading={isSubmitting}>
          Send
        </Button>
        {/* <Button color="transparent" loading={isSubmitting}>
          Save Draft
        </Button> */}
      </div>
    </form>
  );
};

function fromName(email: string) {
  // converts "John Doe <john.doe@gmail>" to "John Doe"
  return email.split("<")[0];
}

function participant(parsedMessage: ParsedMessage, userEmail: string) {
  // returns the other side of the conversation
  // if we're the sender, then return the recipient
  // if we're the recipient, then return the sender

  const sender: string = parsedMessage.headers.from;
  const recipient = parsedMessage.headers.to;

  if (sender.includes(userEmail)) return recipient;

  return sender;
}

function PlanBadge(props: {
  plan?: Plan | null;

  id: string;
  subject: string;
  message: string;
  senderEmail: string;
  refetchEmails: () => void;
}) {
  const { id, subject, message, senderEmail, plan } = props;

  if (!plan) return null;

  if (!plan.rule) return <Badge color={"yellow"}>No plan</Badge>;

  return <Badge color={getActionColor(plan)}>{getActionMessage(plan)}</Badge>;
}

function getActionMessage(plan: Plan | null): string {
  return "To do";
  // switch (plan?.action) {
  //   case "reply":
  //     return "Respond";
  //   case "archive":
  //     return "Archive";
  //   case "label":
  //     return `Label as ${plan.label}`;
  //   case "to_do":
  //     return `To do`;
  //   case "error":
  //     return "Error";
  //   default:
  //     return "Error";
  // }
}

function getActionColor(plan: Plan | null): Color {
  return "green";
  //   switch (plan?.action) {
  // case "reply":
  //   return "green";
  // case "archive":
  //   return "yellow";
  // case "label":
  //   return "blue";
  // case "to_do":
  //   return "purple";
  // case "error":
  //   return "red";
  // default:
  //   return "gray";
  // }
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
      `<base target="_blank"></head>`
    );
  }

  return htmlWithHead;
}
