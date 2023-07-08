import { useCallback, useEffect, useMemo, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import Image from "next/image";
import Confetti from "react-dom-confetti";
import { Button } from "@/components/Button";
import { isErrorMessage } from "@/utils/error";
import { useChat } from "ai/react";
import useSWR from "swr";
import { capitalCase } from "capital-case";
import { ListHeading } from "@/components/ListHeading";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadResponse } from "@/app/api/google/threads/[id]/route";
import { postRequest } from "@/utils/api";
import {
  ClassifyThreadBody,
  ClassifyThreadResponse,
} from "@/app/api/ai/classify/route";
import { useNotification } from "@/providers/NotificationProvider";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/route";
import { Tag } from "@/components/Tag";
import { Linkify } from "@/components/Linkify";
import { PlanBody, PlanResponse } from "@/app/api/ai/plan/route";
import { useGmail } from "@/providers/GmailProvider";
import {
  DraftEmailBody,
  DraftEmailResponse,
} from "@/app/api/google/draft/route";
import { ButtonGroup } from "@/components/ButtonGroup";
import { Badge } from "@/components/Badge";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Input } from "@/components/Input";
import { formatShortDate } from "@/utils/date";
import { fetcher } from "@/providers/SWRProvider";
import { LoadingMiniSpinner } from "@/components/Loading";
import { type Plan } from "@/utils/plan";
import { FilterArgs, FilterFunction } from "@/utils/filters";
import { getCelebrationImage } from "@/utils/celebration";

type Thread = ThreadsResponse["threads"][0];

export function List(props: {
  emails: Thread[];
  filter: FilterFunction;
  filterArgs: FilterArgs;
  refetch: () => void;
}) {
  const { emails, filter, filterArgs } = props;
  const filteredEmails = useMemo(() => {
    return emails.filter((email) =>
      filter({ ...email.plan, threadId: email.id! }, filterArgs)
    );
  }, [emails, filter, filterArgs]);

  console.log(
    "🚀 ~ file: ListNew.tsx:51 ~ filteredEmails ~ filteredEmails:",
    filteredEmails.length
  );

  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
  }, []);

  return (
    <div>
      <div className="py-4 border-b border-gray-200">
        <ListHeading />
      </div>
      {filteredEmails.length ? (
        <EmailList emails={filteredEmails} />
      ) : (
        <>
          <div className="flex items-center justify-center mt-20 text-lg font-semibold text-gray-900">
            Congrats! You made it to Inbox Zero!
          </div>
          <div className="flex items-center justify-center">
            <Confetti
              active={active}
              config={{
                duration: 5_000,
                elementCount: 500,
                spread: 200,
              }}
            />
          </div>
          <div className="mt-8 flex items-center justify-center">
            <Image
              src={getCelebrationImage()}
              width={400}
              height={400}
              alt="Congrats!"
              unoptimized
            />
          </div>
        </>
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
      {plan?.action === "error" ? (
        <Badge color="red">Error: {plan?.action}</Badge>
      ) : (
        <Badge color="green">
          Plan: {plan?.action} `{plan?.label}`
        </Badge>
      )}
    </LoadingContent>
  );
}
