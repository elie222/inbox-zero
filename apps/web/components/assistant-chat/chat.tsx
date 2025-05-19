"use client";

import type React from "react";
import { type ScopedMutator, SWRConfig, useSWRConfig } from "swr";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { MultimodalInput } from "@/components/assistant-chat/multimodal-input";
import { Messages } from "./messages";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { ResizableHandle } from "@/components/ui/resizable";
import { ResizablePanelGroup } from "@/components/ui/resizable";
import { ResizablePanel } from "@/components/ui/resizable";
import { AssistantTabs } from "@/app/(app)/[emailAccountId]/automation/AssistantTabs";
import { ChatProvider } from "./ChatContext";
import { SWRProvider } from "@/providers/SWRProvider";

// Some mega hacky code used here to workaround AI SDK's use of SWR
// AI SDK uses SWR too and this messes with the global SWR config
// Wrapping in SWRConfig to disable global fetcher for this component
// https://github.com/vercel/ai/issues/3214#issuecomment-2675872030
// We then re-enable the regular SWRProvider in the AssistantTabs component
// AI SDK v5 won't use SWR anymore so we can remove this workaround

type ChatProps = {
  id: string;
  initialMessages: Array<UIMessage>;
  emailAccountId: string;
};

export function Chat(props: ChatProps) {
  // Use parent SWR config for mutate
  const { mutate } = useSWRConfig();

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
  mutate: ScopedMutator;
}) {
  const chat = useChat({
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

  return (
    <ChatProvider setInput={chat.setInput}>
      <ResizablePanelGroup direction="horizontal" className="flex-grow">
        <ResizablePanel className="overflow-y-auto">
          <ChatUI chat={chat} chatId={id} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel className="overflow-hidden">
          {/* re-enable the regular SWRProvider */}
          <SWRProvider>
            <AssistantTabs />
          </SWRProvider>
        </ResizablePanel>
      </ResizablePanelGroup>
    </ChatProvider>
  );
}

function ChatUI({
  chat,
  chatId,
}: {
  chat: ReturnType<typeof useChat>;
  chatId: string;
}) {
  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    status,
    stop,
    reload,
  } = chat;

  return (
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
          chatId={chatId}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          status={status}
          stop={stop}
          // attachments={attachments}
          // setAttachments={setAttachments}
          // messages={messages}
          setMessages={setMessages}
          // append={append}
        />
      </form>

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
    </div>
  );
}

// NOTE: not sure why we don't just use the default from AI SDK
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
