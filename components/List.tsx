import { useCallback, useEffect, useState } from "react";
import { useChat } from "ai/react";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "./Button";
import { ThreadResponse } from "@/app/api/google/threads/[id]/route";
import { postRequest } from "@/utils/api";
import { ClassifyThreadResponse } from "@/app/api/ai/classify/route";
import { useNotification } from "@/components/NotificationProvider";
import { ArchiveBody } from "@/app/api/google/threads/archive/route";
import { Tag } from "@/components/Tag";
import { Linkify } from "@/components/Linkify";

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
  console.log("🚀 ~ file: List.tsx:30 ~ ListItem ~ item:", item);

  const { data, isLoading, error } = useSWR<ThreadResponse>(
    `/api/google/threads/${item.id}`
  );
  console.log("🚀 ~ file: List.tsx:33 ~ ListItem ~ data:", data);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [viewFullMessage, setViewFullMessage] = useState(false);
  const { showNotification } = useNotification();

  const from =
    data?.thread.messages?.[0]?.payload?.headers?.find((h) => h.name === "From")
      ?.value || "";
  const labelIds = data?.thread.messages?.[0]?.labelIds || [];

  return (
    <li className="flex py-5 text-white">
      <div className="max-w-full">
        <p className="text-sm font-semibold leading-6 text-white break-words whitespace-pre-wrap">
          From: {from}
        </p>
        <p className="flex space-x-2">
          {labelIds.map((label) => (
            <Tag key={label}>{label.toLowerCase()}</Tag>
          ))}
        </p>
        <p className="text-sm font-semibold leading-6 text-white break-words whitespace-pre-wrap">
          {item.text}
        </p>
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <>
              <p className="mt-1 truncate text-xs leading-5 text-gray-400 break-words whitespace-pre-wrap">
                <Linkify>
                  {viewFullMessage
                    ? data.thread.messages?.[0]?.text
                    : data.thread.messages?.[0]?.text.substring(
                        0,
                        TRUCATE_LENGTH
                      ) || "No message text"}
                </Linkify>
              </p>
              <div className="space-x-2">
                {(data.thread.messages?.[0]?.text?.length || 0) >
                  TRUCATE_LENGTH &&
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

                <Categorise message={data.thread.messages?.[0]?.text || ""} />
                <ResponseMessage
                  message={data.thread.messages?.[0]?.text || ""}
                />
              </div>
            </>
          )}
        </LoadingContent>
      </div>
      <div className="">
        <div className="flex space-x-2">
          <Button
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
    const category = await postRequest<ClassifyThreadResponse>(
      "/api/ai/classify",
      {
        message: props.message,
      }
    );

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

function ResponseMessage(props: { message: string }) {
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
    await postRequest("/api/google/threads/archive", body);
    await fetch("/api/google/threads/archive", {
      method: "POST",
      body: JSON.stringify(body),
    });

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
