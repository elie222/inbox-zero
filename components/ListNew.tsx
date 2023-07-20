import {
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { capitalCase } from "capital-case";
import sortBy from "lodash/sortBy";
import groupBy from "lodash/groupBy";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Badge, Color } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Celebration } from "@/components/Celebration";
import { GroupHeading } from "@/components/GroupHeading";
import { Input } from "@/components/Input";
import { LoadingMiniSpinner } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { fetcher } from "@/providers/SWRProvider";
import { formatShortDate } from "@/utils/date";
import { FilterArgs, FilterFunction } from "@/utils/filters";
import { type Plan } from "@/utils/redis/plan";
import { ActionButtons } from "@/components/ActionButtons";
import { labelThreadsAction } from "@/utils/actions";
import { useGmail } from "@/providers/GmailProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { CommandDialogDemo } from "@/components/CommandDemo";
import { Tabs } from "@/components/Tabs";
import { PlanBody, PlanResponse } from "@/app/api/ai/plan/controller";
import { Tooltip } from "@/components/Tooltip";
import { postRequest } from "@/utils/api";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/controller";
import { isErrorMessage } from "@/utils/error";

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
      filteredEmails.filter((e) => e.plan?.action),
      (e) => `${e.plan?.action}---${e.plan?.label || ""}`
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

  const [applyingAiSuggestions, setApplyingAiSuggestions] = useState(false);

  return (
    <>
      <div className="border-b border-gray-200 py-2">
        <GroupHeading
          leftContent={<Tabs selected={selectedTab} tabs={tabs} />}
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
                    label: "Apply AI Suggestions",
                    onClick: async () => {
                      setApplyingAiSuggestions(true);
                      try {
                        for (const email of tabEmails) {
                          if (!email.plan) continue;

                          const subject =
                            email.thread.messages?.[0]?.parsedMessage.headers
                              .subject || "";

                          if (email.plan.action === "archive") {
                            try {
                              // had trouble with server actions here
                              const res = await postRequest<
                                ArchiveResponse,
                                ArchiveBody
                              >("/api/google/threads/archive", {
                                id: email.id!,
                              });

                              if (isErrorMessage(res)) {
                                console.error(res);
                                toastError({
                                  description: `Error archiving  ${subject}`,
                                });
                              } else {
                                toastSuccess({
                                  title: "Archvied!",
                                  description: `Archived ${subject}`,
                                });
                              }
                            } catch (error) {
                              console.error(error);
                              toastError({
                                description: `Error archiving ${subject}`,
                              });
                            }
                          } else if (email.plan.action === "label") {
                            const labelName = email.plan.label;
                            const label = labelsArray.find(
                              (label) => label.name === labelName
                            );
                            if (!label) continue;

                            await labelThreadsAction({
                              labelId: label.id,
                              threadIds: [email.id!],
                              // threadIds: tabEmails
                              //   .map((email) => email.id!)
                              //   .filter(Boolean),
                              archive: true,
                            });

                            toastSuccess({
                              title: "Labelled",
                              description: `Labelled ${subject}`,
                            });
                          }
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
      {tabEmails.length ? (
        <EmailList emails={tabEmails} refetch={props.refetch} />
      ) : (
        <Celebration />
      )}
    </>
  );
}

function EmailList(props: { emails: Thread[]; refetch: () => void }) {
  // if performance becomes an issue check this:
  // https://ianobermiller.com/blog/highlight-table-row-column-react#react-state
  const [hovered, setHovered] = useState<Thread>();
  const [openedRow, setOpenedRow] = useState<Thread>();
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const closePanel = useCallback(() => setOpenedRow(undefined), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" && e.shiftKey) {
        setSelectedRows((s) => ({ ...s, [hovered?.id!]: true }));
        console.log("down");
      } else if (e.key === "ArrowUp") {
        console.log("up");
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [hovered?.id]);

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
            email={email}
            opened={openedRow?.id === email.id}
            selected={selectedRows[email.id!]}
            splitView={!!openedRow}
            onClick={() => {
              setOpenedRow(email);
            }}
            onMouseEnter={() => setHovered(email)}
            refetchEmails={props.refetch}
          />
        ))}
      </ul>

      {!!openedRow && <EmailPanel row={openedRow} close={closePanel} />}

      <CommandDialogDemo selected={hovered?.id || undefined} />
    </div>
  );
}

function EmailListItem(props: {
  email: Thread;
  opened: boolean;
  selected: boolean;
  splitView: boolean;
  onClick: MouseEventHandler<HTMLLIElement>;
  onMouseEnter: () => void;
  refetchEmails: () => void;
}) {
  const { email, splitView } = props;

  const lastMessage = email.thread.messages?.[email.thread.messages.length - 1];

  return (
    <li
      className={clsx(
        "group relative cursor-pointer border-l-4 py-3 hover:bg-gray-50",
        {
          "bg-gray-500": props.selected,
          "border-l-blue-500 bg-gray-50": props.opened,
        }
      )}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
    >
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex justify-between">
          {/* left */}
          <div
            className={clsx(
              "flex whitespace-nowrap text-sm leading-6",
              splitView ? "w-2/3" : "w-5/6"
            )}
          >
            <div className="w-40 min-w-0 overflow-hidden truncate font-semibold text-gray-900">
              {fromName(lastMessage.parsedMessage.headers.from)}
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
                  onGenerateAiResponse={() => {}}
                />
              </div>
              <div className="flex-shrink-0 text-sm font-medium leading-5 text-gray-500">
                {formatShortDate(new Date(+(lastMessage?.internalDate || "")))}
              </div>
            </div>

            <div className="ml-3 whitespace-nowrap">
              <PlanBadge
                id={email.id || ""}
                subject={lastMessage?.parsedMessage.headers.subject || ""}
                message={
                  lastMessage?.parsedMessage.textPlain ||
                  lastMessage?.parsedMessage.textHtml ||
                  lastMessage?.parsedMessage.headers.subject ||
                  ""
                }
                plan={email.plan}
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

{
  /* <div className="min-w-[500px]">
            <SendEmailForm />
          </div> */
}

{
  /* <div className="flex items-center gap-x-4">
            <div className="hidden sm:flex sm:flex-col sm:items-end">
              <p className="text-sm leading-6 text-gray-900">{person.role}</p>
              {person.lastSeen ? (
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Last seen{" "}
                  <time dateTime={person.lastSeenDateTime}>
                    {person.lastSeen}
                  </time>
                </p>
              ) : (
                <div className="mt-1 flex items-center gap-x-1.5">
                  <div className="flex-none rounded-full bg-emerald-500/20 p-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-xs leading-5 text-gray-500">Online</p>
                </div>
              )}
            </div>
            <ChevronRightIcon
              className="h-5 w-5 flex-none text-gray-400"
              aria-hidden="true"
            />
          </div> */
}

function EmailPanel(props: { row: Thread; close: () => void }) {
  const lastMessage =
    props.row.thread.messages?.[props.row.thread.messages.length - 1];
  const html = lastMessage.parsedMessage.textHtml || "";

  const srcDoc = useMemo(() => getIframeHtml(html), [html]);

  return (
    <div className="flex flex-col border-l border-l-gray-100">
      <div className="sticky flex items-center justify-between border-b border-b-gray-100 p-4">
        <div className="">{lastMessage.parsedMessage.headers.subject}</div>
        <div className="ml-2 flex items-center ">
          <ActionButtons
            threadId={props.row.id!}
            onGenerateAiResponse={() => {}}
          />
          <div className="ml-2 flex items-center">
            <Tooltip content="Close" useRef>
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
        <div className="flex-1">
          <iframe srcDoc={srcDoc} className="h-full w-full" />
        </div>
        {props.row.plan?.action === "reply" && (
          <div className="h-64 shrink-0 border-t border-t-gray-100">
            <SendEmailForm
              threadId={props.row.id!}
              defaultMessage={props.row.plan?.response || ""}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type Inputs = { threadId: string; message: string };

const SendEmailForm = (props: { threadId: string; defaultMessage: string }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    getValues,
  } = useForm<Inputs>({
    defaultValues: {
      threadId: props.threadId,
      message: props.defaultMessage,
    },
  });

  useEffect(() => {
    if (props.threadId !== getValues("threadId")) {
      reset({
        threadId: props.threadId,
        message: props.defaultMessage,
      });
    }
  }, [getValues, props.threadId, props.defaultMessage, reset]);

  const onSubmit: SubmitHandler<Inputs> = useCallback(async (data) => {
    console.log("🚀 ~ file: ListNew.tsx:187 ~ data:", data);
    // const res = await updateProfile(data);
    // if (isErrorMessage(res))
    //   toastError({ description: `` });
    // else toastSuccess({ description: `` });
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-4">
      <Input
        type="text"
        as="textarea"
        rows={6}
        name="message"
        label="Reply"
        registerProps={register("message", { required: true })}
        error={errors.message}
      />
      <div className="mt-2 flex">
        <Button type="submit" color="transparent" loading={isSubmitting}>
          Send
        </Button>
        <Button color="transparent" loading={isSubmitting}>
          Save Draft
        </Button>
      </div>
    </form>
  );
};

function fromName(email: string) {
  // converts "John Doe <john.doe@gmail>" to "John Doe"
  return email.split("<")[0];
}

function PlanBadge(props: {
  id: string;
  subject: string;
  message: string;
  plan?: Plan | null;
  refetchEmails: () => void;
}) {
  // skip fetching plan if we have it already
  // TODO move this higher up the tree. We need to know plans to refetch tabs too
  const { data, isLoading, error } = useSWR<PlanResponse>(
    !props.plan && `/api/ai/plan?id=${props.id}`,
    (url) => {
      const body: PlanBody = {
        id: props.id,
        subject: props.subject,
        message: props.message,
      };
      return fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  );

  const { refetchEmails } = props;

  useEffect(() => {
    if (!props.plan && data?.plan?.action) refetchEmails();
  }, [data?.plan?.action, props.plan, refetchEmails]);

  const plan = props.plan || data?.plan;

  if (plan?.action === "error") {
    console.error(plan?.response);
  }

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<LoadingMiniSpinner />}
    >
      {!!plan && (
        <Badge color={getActionColor(plan)}>{getActionMessage(plan)}</Badge>
      )}
    </LoadingContent>
  );
}

function getActionMessage(plan: Plan | null): string {
  switch (plan?.action) {
    case "reply":
      return "Respond";
    case "archive":
      return "Archive";
    case "label":
      return `Label as ${plan.label}`;
    case "to_do":
      return `To do`;
    case "error":
      return "Error";
    default:
      return "Error";
  }
}

function getActionColor(plan: Plan | null): Color {
  switch (plan?.action) {
    case "reply":
      return "green";
    case "archive":
      return "yellow";
    case "label":
      return "blue";
    case "to_do":
      return "purple";
    case "error":
      return "red";
    default:
      return "gray";
  }
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
