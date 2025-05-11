"use client";

import type { Attachment, UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { MultimodalInput } from "@/components/assistant-chat/multimodal-input";
import { Messages } from "./messages";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  emailAccountId,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel: string;
  emailAccountId: string;
}) {
  const { mutate } = useSWRConfig();

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
  } = useChat({
    id,
    body: { id, selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    // is SWR somehow messing with the request that we need pass the headers in like this?
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        headers: new Headers({
          ...options?.headers,
          [EMAIL_ACCOUNT_HEADER]: emailAccountId,
        }),
      });
    },
    onFinish: () => {
      mutate("/api/chat/history");
    },
    onError: () => {
      toast.error("An error occured, please try again!");
    },
  });

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  return (
    <>
      <div className="flex h-full min-w-0 flex-col bg-background">
        <Messages
          status={status}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isArtifactVisible={false}
        />

        <form className="mx-auto flex w-full gap-2 bg-background px-4 pb-4 md:max-w-3xl md:pb-6">
          <MultimodalInput
            chatId={id}
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            status={status}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            setMessages={setMessages}
            append={append}
          />
        </form>
      </div>

      {/* <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
      /> */}
    </>
  );
}
