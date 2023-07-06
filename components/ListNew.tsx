import { useCallback, useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/Button";
import { isErrorMessage } from "@/utils/error";
import { useChat } from "ai/react";
import useSWR from "swr";
import { capitalCase } from "capital-case";
import {
  ArchiveBoxArrowDownIcon,
  ArrowsPointingOutIcon,
  SparklesIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
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

type Thread = ThreadsResponse["threads"][0];

export function List(props: { emails: Thread[]; refetch: () => void }) {
  const { emails } = props;

  return (
    <div>
      <div className="py-4 border-b border-gray-200">
        <ListHeading />
      </div>
      <EmailList emails={emails} />
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
  console.log("🚀 ~ file: ListNew.tsx:64 ~ EmailListItem ~ email:", email);

  return (
    <li className="relative py-5 hover:bg-gray-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex justify-between gap-x-6">
          <div className="flex gap-x-4">
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

          <div className="">
            <ButtonGroup
              buttons={[
                {
                  tooltip: "Expand",
                  onClick: () => {},
                  icon: (
                    <ArrowsPointingOutIcon
                      className="h-5 w-5 text-gray-700"
                      aria-hidden="true"
                    />
                  ),
                },
                {
                  tooltip: "AI Categorise",
                  onClick: () => {},
                  icon: (
                    <TagIcon
                      className="h-5 w-5 text-gray-700"
                      aria-hidden="true"
                    />
                  ),
                },
                {
                  tooltip: "Generate AI response",
                  onClick: () => {},
                  icon: (
                    <SparklesIcon
                      className="h-5 w-5 text-gray-700"
                      aria-hidden="true"
                    />
                  ),
                },
                {
                  tooltip: "Archive",
                  onClick: () => {},
                  icon: (
                    <ArchiveBoxArrowDownIcon
                      className="h-5 w-5 text-gray-700"
                      aria-hidden="true"
                    />
                  ),
                },
              ]}
            />

            <div className="mt-1">
              <Badge color="green">Plan: Archive</Badge>
            </div>
          </div>

          <div className="min-w-[500px]">
            {/* <Input type="text" name="message" as="textarea" /> */}
            <SendEmailForm />
          </div>

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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        as="textarea"
        rows={4}
        name="message"
        label="Message"
        registerProps={register("message", { required: true })}
        error={errors.message}
      />
      <Button type="submit" color="gradient" full loading={isSubmitting}>
        Send
      </Button>
    </form>
  );
};

function fromName(email: string) {
  // converts "John Doe <john.doe@gmail>" to "John Doe"
  return capitalCase(email.split("<")[0]);
}
