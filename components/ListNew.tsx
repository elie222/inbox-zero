import { capitalCase } from "capital-case";
import { useCallback, useMemo } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
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
import { type Plan } from "@/utils/plan";

type Thread = ThreadsResponse["threads"][0];

export function List(props: {
  emails: Thread[];
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

  return (
    <div>
      <div className="py-4 border-b border-gray-200">
        <GroupHeading
          text="Label and archive all newsletter emails"
          buttons={[
            {
              label: "Execute",
              onClick: () => {},
            },
          ]}
        />
      </div>
      {filteredEmails.length ? (
        <EmailList emails={filteredEmails} />
      ) : (
        <Celebration />
      )}
    </div>
  );
}

function EmailList(props: { emails: Thread[] }) {
  return (
    <ul role="list" className="divide-y divide-gray-100">
      {props.emails.map((email) => (
        <EmailListItem key={email.id} email={email} />
      ))}
    </ul>
  );
}

function EmailListItem(props: { email: Thread }) {
  const { email } = props;

  const lastMessage = email.thread.messages?.[email.thread.messages.length - 1];

  return (
    <li className="relative py-3 hover:bg-gray-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex justify-between gap-x-6">
          <div className="flex gap-x-4 flex-1">
            <div className="min-w-0 flex-auto">
              <p className="text-sm font-semibold leading-6 text-gray-900">
                {/* <span className="absolute inset-x-0 -top-px bottom-0" /> */}
                {fromName(
                  email.thread?.messages?.[0]?.parsedMessage.headers.from
                )}
                <span className="ml-4 text-gray-500 font-normal">
                  {email.thread?.messages?.[0]?.parsedMessage.headers.subject}
                </span>
              </p>
              <p className="mt-1 flex text-xs leading-5 text-gray-500">
                {email.snippet}
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <div className="text-sm leading-5 text-gray-500 font-medium flex-shrink-0">
              {formatShortDate(new Date(+(lastMessage?.internalDate || "")))}
            </div>
            <div className="ml-3">
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
      <div className="flex mt-2">
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
  return capitalCase(email.split("<")[0]);
}

function PlanBadge(props: { id: string; message: string; plan?: Plan | null }) {
  // skip fetching plan if we have it already
  const { data, isLoading, error } = useSWR<PlanResponse>(
    !props.plan && `/api/ai/plan?id=${props.id}`,
    (url) => {
      const body: PlanBody = { id: props.id, message: props.message };
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
      {!!plan && <Badge color={getActionColor(plan)}>{getActionMessage(plan)}</Badge>}
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
