import { useCallback, useEffect, useState } from "react";
import { useChat } from "ai/react";
import useSWR from "swr";
import { capitalCase } from "capital-case";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "./Button";
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
} from "@/app/api/google/threads/archive/controller";
import { Tag } from "@/components/Tag";
import { Linkify } from "@/components/Linkify";
import { PlanBody, PlanResponse } from "@/app/api/ai/plan/controller";
import { useGmail } from "@/providers/GmailProvider";
import {
  DraftEmailBody,
  DraftEmailResponse,
} from "@/app/api/google/draft/route";

type Item = { id: string; text: string };

export function List(props: { items: Item[]; refetch: () => void }) {
  const { items } = props;

  return (
    <ul role="list" className="divide-y divide-gray-800">
      {items.map((item) => (
        <ListItem key={item.id} item={item} refetch={props.refetch} />
      ))}
    </ul>
  );
}

const TRUCATE_LENGTH = 280;

function ListItem(props: { item: Item; refetch: () => void }) {
  const { item } = props;

  const { data, isLoading, error } = useSWR<ThreadResponse>(
    `/api/google/threads/${item.id}`
  );
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [viewFullMessage, setViewFullMessage] = useState(false);
  const { showNotification } = useNotification();

  const from =
    data?.thread.messages?.[0]?.payload?.headers?.find((h) => h.name === "From")
      ?.value || "";
  const labelIds = data?.thread.messages?.[0]?.labelIds || [];
  const gmail = useGmail();
  const labels = labelIds
    .map((labelId) => {
      // filtering for Boolean on next line to remove undefined
      return gmail.labels?.[labelId]!;
    })
    .filter(Boolean);

  return (
    <li className="flex py-5 text-white">
      <div className="max-w-full">
        <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-white">
          From: {from}
        </p>
        <div className="flex space-x-2">
          {labels.map((label) => (
            <Tag key={label.name} customColors={label.color}>
              {label?.type === "system" ? capitalCase(label.name) : label.name}
            </Tag>
          ))}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-white">
          {item.text}
        </p>
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <>
              <p className="mt-1 truncate whitespace-pre-wrap break-words text-xs leading-5 text-gray-400">
                <Linkify>
                  {viewFullMessage
                    ? data.thread.messages?.[0]?.parsedMessage.textPlain
                    : data.thread.messages?.[0]?.parsedMessage.textPlain.substring(
                        0,
                        TRUCATE_LENGTH
                      ) || "No message text"}
                </Linkify>
              </p>
              <div className="space-x-2">
                {(data.thread.messages?.[0]?.parsedMessage.textPlain?.length ||
                  0) > TRUCATE_LENGTH &&
                  !viewFullMessage && (
                    <Button
                      color="white"
                      size="xs"
                      onClick={() => {
                        setViewFullMessage(true);
                      }}
                    >
                      View Full
                    </Button>
                  )}

                {/* <Categorise message={data.thread.messages?.[0]?.text || ""} /> */}
                <Plan
                  id={data.thread.id || ""}
                  message={
                    data.thread.messages?.[0]?.parsedMessage.textPlain || ""
                  }
                />
                <ResponseMessage
                  message={
                    data.thread.messages?.[0]?.parsedMessage.textPlain || ""
                  }
                  threadId={data.thread.id || ""}
                />
              </div>
            </>
          )}
        </LoadingContent>
      </div>
      <div className="">
        <div className="flex space-x-2">
          <Button
            color="white"
            size="xs"
            loading={isLoadingArchive}
            onClick={() => {
              onArchive({
                id: item.id,
                showNotification,
                refetch: props.refetch,
              });
              setIsLoadingArchive(true);
            }}
          >
            Archive
          </Button>
          <Button
            color="white"
            size="xs"
            onClick={() => {
              // open in gmail
              window.open(
                `https://mail.google.com/mail/u/0/#inbox/${item.id}`,
                "_blank"
              );
            }}
          >
            Open
          </Button>
        </div>
      </div>
    </li>
  );
}

function Categorise(props: { message: string }) {
  const [category, setCategory] = useState<string>();
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);

  const onClickCategorise = useCallback(async () => {
    setIsLoadingCategory(true);
    const category = await postRequest<
      ClassifyThreadResponse,
      ClassifyThreadBody
    >("/api/ai/classify", {
      message: props.message,
    });

    setCategory(category.message);
    setIsLoadingCategory(false);
  }, [props.message]);

  useEffect(() => {
    onClickCategorise();
  }, [onClickCategorise]);

  return (
    <>
      <Button
        color="white"
        size="xs"
        loading={isLoadingCategory}
        onClick={onClickCategorise}
      >
        Categorise
      </Button>
      {category && <div>Category: {category}</div>}
    </>
  );
}

function Plan(props: { id: string; message: string }) {
  const [plan, setPlan] = useState<string>();
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);

  const onClickPlan = useCallback(async () => {
    setIsLoadingPlan(true);
    const plan = await postRequest<PlanResponse, PlanBody>("/api/ai/plan", {
      id: props.id,
      message: props.message,
    });

    // setPlan(plan.message);
    setIsLoadingPlan(false);
  }, [props.id, props.message]);

  // useEffect(() => {
  //   onClickPlan();
  // }, [onClickPlan]);

  return (
    <>
      <Button
        color="white"
        size="xs"
        loading={isLoadingPlan}
        onClick={onClickPlan}
      >
        Plan
      </Button>
      {plan && <div>Plan: {plan}</div>}
    </>
  );
}

function ResponseMessage(props: { message: string; threadId: string }) {
  const { showNotification } = useNotification();

  const { messages, handleSubmit, isLoading } = useChat({
    api: "/api/ai/respond",
    body: { message: props.message },
    initialInput: " ", // to allow submit to happen. not used
    onResponse: (response) => {
      if (response.status === 429) {
        showNotification({
          type: "error",
          description: "You have reached your request limit for the day.",
        });
        // va.track("Rate limited");
        return;
      } else {
        // va.track("Response requested");
      }
    },
    onError: (error) => {
      showNotification({
        type: "error",
        description: `There was an error: ${error.message}`,
      });
      // va.track("Response errored", {
      //   input,
      //   error: error.message,
      // });
    },
  });

  return (
    <>
      <form onSubmit={handleSubmit}>
        <Button color="white" size="xs" type="submit" loading={isLoading}>
          Respond
        </Button>
      </form>
      {!!messages.length && (
        <div>Response: {messages[messages.length - 1].content}</div>
      )}
      <Button
        color="white"
        size="xs"
        loading={isLoading}
        onClick={async () => {
          try {
            const draft = await postRequest<DraftEmailResponse, DraftEmailBody>(
              "/api/google/draft",
              {
                subject: "Re: " + props.message.substring(0, 20),
                body: messages[messages.length - 1].content,
                threadId: props.threadId,
              }
            );
            console.log("🚀 ~ file: List.tsx:300 ~ draft:", draft);

            showNotification({
              type: "success",
              title: "Success",
              description: "Draft created.",
            });
          } catch (error) {
            console.error(error);
            showNotification({
              type: "error",
              title: "Error",
              description: "There was an error creating the draft.",
            });
          }
        }}
      >
        Create Draft
      </Button>
    </>
  );
}

async function onArchive(options: {
  id: string;
  showNotification: (options: any) => void;
  refetch: () => void;
}) {
  const { id, showNotification, refetch } = options;
  const body: ArchiveBody = { id };

  try {
    await postRequest<ArchiveResponse, ArchiveBody>(
      "/api/google/threads/archive",
      body
    );

    showNotification({
      type: "success",
      title: "Success",
      description: "The thread was archived.",
    });
  } catch (error) {
    showNotification({
      type: "error",
      title: "Error archiving thread",
      description: "There was an error archiving the thread.",
    });
  } finally {
    refetch();
  }
}
