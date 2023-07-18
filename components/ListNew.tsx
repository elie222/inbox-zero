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
import { PlanBody, PlanResponse } from "@/app/api/ai/plan/route";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Badge, Color } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Celebration } from "@/components/Celebration";
import { GroupHeading } from "@/components/GroupHeading";
import { Input } from "@/components/Input";
import { LoadingMiniSpinner } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { useNotification } from "@/providers/NotificationProvider";
import { fetcher } from "@/providers/SWRProvider";
import { formatShortDate } from "@/utils/date";
import { FilterArgs, FilterFunction } from "@/utils/filters";
import { type Plan } from "@/utils/redis/plan";
import { ActionButtons } from "@/components/ActionButtons";
import { labelThreadsAction } from "@/utils/actions";
import { useGmail } from "@/providers/GmailProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { CommandDialogDemo } from "@/components/CommandDemo";
import { SlideOverSheet } from "@/components/SlideOverSheet";
import { Tabs } from "@/components/Tabs";

type Thread = ThreadsResponse["threads"][0];

export function List(props: {
  emails: Thread[];
  prompt?: string;
  filter?: FilterFunction;
  filterArgs?: FilterArgs;
  refetch: () => void;
}) {
  const { emails, filter, filterArgs } = props;
  const filteredEmails = useMemo(() => {
    if (!filter) return emails;

    return emails.filter((email) =>
      filter({ ...(email.plan || {}), threadId: email.id! }, filterArgs)
    );
  }, [emails, filter, filterArgs]);

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

  const tabGroups = useMemo(
    () =>
      groupBy(
        filteredEmails.filter((e) => e.plan?.action),
        (e) => `${e.plan?.action}---${e.plan?.label || ""}`
      ),
    [filteredEmails]
  );

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
                          threadIds: filteredEmails.map((email) => email.id!),
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
                          threadIds: filteredEmails.map((email) => email.id!),
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
                      try {
                        for (const email of filteredEmails) {
                          if (!email.plan) continue;
                          if (email.plan.action === "archive") {
                            // TODO
                          } else if (email.plan.action === "label") {
                            const labelName = email.plan.label;
                            const label = labelsArray.find(
                              (label) => label.name === labelName
                            );
                            if (!label) continue;

                            await labelThreadsAction({
                              labelId: label.id,
                              threadIds: filteredEmails
                                .map((email) => email.id!)
                                .filter(Boolean),
                              archive: true,
                            });

                            toastSuccess({
                              description: `Applied AI suggestion to ${email.thread.messages?.[0]?.parsedMessage.headers.subject}`,
                            });
                          }
                        }

                        toastSuccess({
                          description: `Applied AI suggestions!`,
                        });
                      } catch (error) {
                        toastError({
                          description: `There was an error applying the AI suggestions.`,
                        });
                      }
                    },
                  },
                ]
          }
        />
      </div>
      {tabEmails.length ? <EmailList emails={tabEmails} /> : <Celebration />}
    </>
  );
}

function EmailList(props: { emails: Thread[] }) {
  // if performance becomes an issue check this:
  // https://ianobermiller.com/blog/highlight-table-row-column-react#react-state
  const [hovered, setHovered] = useState<Thread>();
  const [openedRow, setOpenedRow] = useState<Thread>();
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

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
      className={clsx("h-full", {
        "grid grid-cols-2": !!openedRow,
      })}
    >
      <ul role="list" className="divide-y divide-gray-100 overflow-y-auto">
        {props.emails.map((email) => (
          <EmailListItem
            key={email.id}
            email={email}
            opened={openedRow?.id === email.id}
            selected={selectedRows[email.id!]}
            onClick={() => {
              setOpenedRow(email);
            }}
            onMouseEnter={() => setHovered(email)}
          />
        ))}
      </ul>

      {!!openedRow && (
        <div className="overflow-y-auto border-l border-l-gray-100 bg-white">
          <iframe
            srcDoc={getIframeHtml(
              openedRow.thread.messages?.[0].parsedMessage.textHtml || ""
            )}
            className="h-full w-full"
          />
        </div>
      )}

      <CommandDialogDemo selected={hovered?.id || undefined} />
    </div>
  );
}

function EmailListItem(props: {
  email: Thread;
  opened: boolean;
  selected: boolean;
  onClick: MouseEventHandler<HTMLLIElement>;
  onMouseEnter: () => void;
}) {
  const { email } = props;

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
        <div className="mx-auto flex justify-between gap-x-6">
          <div className="flex flex-1 gap-x-4">
            <div className="min-w-0 flex-auto">
              <p className="text-sm leading-6">
                <span className="font-semibold text-gray-900">
                  {fromName(
                    email.thread?.messages?.[0]?.parsedMessage.headers.from
                  )}
                </span>
                <span className="ml-4 font-medium text-gray-700">
                  {email.thread?.messages?.[0]?.parsedMessage.headers.subject}
                </span>
                <span className="ml-8 font-normal leading-5 text-gray-500">
                  {email.snippet}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <div className="relative ml-3 flex items-center">
              <div className="absolute right-0 z-20 hidden group-hover:block">
                <ActionButtons threadId={email.id!} />
              </div>
              <div className="flex-shrink-0 text-sm font-medium leading-5 text-gray-500">
                {formatShortDate(new Date(+(lastMessage?.internalDate || "")))}
              </div>
            </div>

            <div className="ml-3 whitespace-nowrap">
              <PlanBadge
                id={email.id || ""}
                message={lastMessage?.parsedMessage.textPlain || ""}
                plan={email.plan}
              />
            </div>
          </div>

          {/* <div className="min-w-[500px]">
            <SendEmailForm />
          </div> */}

          {/* <div className="flex items-center gap-x-4">
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
          </div> */}
        </div>
      </div>
    </li>
  );
}

type Inputs = { message: string };

const SendEmailForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();
  const { showNotification } = useNotification();

  const onSubmit: SubmitHandler<Inputs> = useCallback(
    async (data) => {
      console.log("🚀 ~ file: ListNew.tsx:187 ~ data:", data);
      // const res = await updateProfile(data);
      // if (isErrorMessage(res))
      //   showNotification({ type: "error", description: `` });
      // else showNotification({ type: "success", description: `` });
    },
    [showNotification]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        as="textarea"
        rows={4}
        name="message"
        label="Message"
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

function PlanBadge(props: { id: string; message: string; plan?: Plan | null }) {
  // skip fetching plan if we have it already
  const { data, isLoading, error } = useSWR<PlanResponse>(
    !props.plan && `/api/ai/plan?id=${props.id}`,
    (url) => {
      const body: PlanBody = {
        id: props.id,
        message: props.message,
      };
      return fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  );

  const plan = props.plan || data?.plan;

  if (plan?.action === "error") {
    console.log(plan?.response);
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
    case "respond":
      return "Respond";
    case "archive":
      return "Archive";
    case "label":
      return `Label as ${plan.label}`;
    case "error":
      return "Error";
    default:
      return "Error";
  }
}

function getActionColor(plan: Plan | null): Color {
  switch (plan?.action) {
    case "respond":
      return "green";
    case "archive":
      return "yellow";
    case "label":
      return "blue";
    case "error":
      return "red";
    default:
      return "gray";
  }
}

function getIframeHtml(html: string) {
  // Open all links in a new tab
  if (html.indexOf("</head>") !== -1)
    return html.replace("</head>", `<base target="_blank"></head>`);

  return `<head><base target="_blank"></head>${html}`;
}
