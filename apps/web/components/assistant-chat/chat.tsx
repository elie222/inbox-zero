"use client";

import { SWRConfig, useSWRConfig } from "swr";
import type { Attachment, UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useState } from "react";
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

type ChatProps = {
  id: string;
  initialMessages: Array<UIMessage>;
  emailAccountId: string;
};

export function Chat(props: ChatProps) {
  // Use parent SWR config for mutate
  const { mutate } = useSWRConfig();

  // AI SDK uses SWR too and this messes with the global SWR config
  // Wrapping in SWRConfig to disable global fetcher for this component
  // https://github.com/vercel/ai/issues/3214#issuecomment-2675872030
  return (
    <SWRConfig
      value={{
        fetcher: undefined, // Disable global fetcher for this component
      }}
    >
      <ChatInner {...props} mutate={mutate} />
    </SWRConfig>
  );
}

function ChatInner({
  id,
  initialMessages,
  emailAccountId,
  mutate,
}: ChatProps & {
  mutate: (key: string) => Promise<any>;
}) {
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
    body: { id },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    headers: {
      [EMAIL_ACCOUNT_HEADER]: emailAccountId,
    },
    onFinish: () => {
      mutate("/api/user/rules");
    },
    onError: (error) => {
      console.error(error);
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
          setInput={setInput}
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
