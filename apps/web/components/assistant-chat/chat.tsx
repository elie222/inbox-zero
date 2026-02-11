"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpIcon,
  HistoryIcon,
  LightbulbIcon,
  Loader2,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import { Messages } from "./messages";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChats } from "@/hooks/useChats";
import { LoadingContent } from "@/components/LoadingContent";
import { ExamplesDialog } from "@/components/assistant-chat/examples-dialog";
import { Tooltip } from "@/components/Tooltip";
import { useChat } from "@/providers/ChatProvider";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useLocalStorage } from "usehooks-ts";
import { useSession } from "@/utils/auth-client";

const MAX_MESSAGES = 20;

export function Chat({
  open,
  isSidebar,
}: {
  open: boolean;
  isSidebar?: boolean;
}) {
  const {
    chat,
    chatId,
    input,
    setInput,
    handleSubmit,
    setNewChat,
    context,
    setContext,
  } = useChat();
  const { messages, status, stop, regenerate, setMessages } = chat;
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    "",
  );

  useEffect(() => {
    if (open && !chatId) {
      setNewChat();
    }
  }, [open, chatId, setNewChat]);

  // Sync input with localStorage
  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  // Load from localStorage on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    if (localStorageInput) {
      setInput(localStorageInput);
    }
  }, []);

  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0];
  const hasMessages = messages.length > 0;

  const inputArea = (
    <PromptInput
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim() && status === "ready") {
          handleSubmit();
          setLocalStorageInput("");
        }
      }}
      className="relative rounded-2xl"
    >
      <PromptInputTextarea
        value={input}
        placeholder="Ask me anything"
        onChange={(e) => setInput(e.currentTarget.value)}
        className="pr-14"
      />
      <PromptInputSubmit
        status={
          status === "streaming"
            ? "streaming"
            : status === "submitted"
              ? "submitted"
              : "ready"
        }
        disabled={(!input.trim() && !context) || status !== "ready"}
        className="absolute bottom-2 right-2 h-9 w-9 rounded-full bg-blue-500 text-white hover:bg-blue-600"
        onClick={(e) => {
          if (status === "streaming") {
            e.preventDefault();
            stop();
            setMessages((messages) => messages);
          }
        }}
      >
        {status === "submitted" ? (
          <Loader2 className="size-5 animate-spin" />
        ) : status === "streaming" ? (
          <SquareIcon className="size-4" />
        ) : (
          <ArrowUpIcon className="size-5" />
        )}
      </PromptInputSubmit>
    </PromptInput>
  );

  if (!hasMessages) {
    return (
      <div className="chat-layout flex h-full min-w-0 flex-col">
        <div className="mx-auto flex w-full max-w-[var(--chat-max-w)] items-center justify-between px-[var(--chat-px)] pt-2">
          <div>{isSidebar && <SidebarTrigger name="chat-sidebar" />}</div>
          <div className="flex items-center gap-1">
            <ChatHistoryDropdown />
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-[var(--chat-px)]">
          <div className="w-full max-w-[var(--chat-max-w)]">
            <h1 className="mb-6 text-center text-4xl font-extralight tracking-tight">
              Good afternoon{firstName ? `, ${firstName}` : ""}
            </h1>
            {inputArea}
            <div className="mt-4 flex justify-center">
              <ExamplesDialog setInput={setInput}>
                <Button variant="outline" className="gap-2 rounded-full">
                  <LightbulbIcon className="size-4" />
                  Choose from examples
                </Button>
              </ExamplesDialog>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-layout flex h-full min-w-0 flex-col">
      <div className="mx-auto flex w-full max-w-[var(--chat-max-w)] items-center justify-between px-[var(--chat-px)] pt-2">
        <div>
          {isSidebar && <SidebarTrigger name="chat-sidebar" />}
          {messages.length > MAX_MESSAGES ? (
            <div className="rounded-md border border-red-200 bg-red-100 p-2 text-sm text-red-800">
              The chat is too long. Please start a new conversation.
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <NewChatButton />
          <ExamplesDialog setInput={setInput} />
          <ChatHistoryDropdown />
        </div>
      </div>
      <div className="pointer-events-none h-10 -mb-10 z-10 bg-gradient-to-b from-background to-transparent" />

      <Messages
        status={status}
        messages={messages}
        setMessages={setMessages}
        setInput={setInput}
        regenerate={regenerate}
        isArtifactVisible={false}
        footer={
          <>
            {context ? (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  Fix: {context.message.headers.subject.slice(0, 60)}
                  {context.message.headers.subject.length > 60 ? "..." : ""}
                  <button
                    type="button"
                    aria-label="Remove context"
                    className="ml-1 rounded p-0.5 hover:bg-muted-foreground/10"
                    onClick={() => setContext(null)}
                  >
                    ×
                  </button>
                </span>
              </div>
            ) : null}
            {inputArea}
          </>
        }
      />
    </div>
  );
}

function NewChatButton() {
  const { setNewChat } = useChat();

  return (
    <Tooltip content="Start a new conversation">
      <Button variant="ghost" size="icon" onClick={setNewChat}>
        <PlusIcon className="size-5" />
        <span className="sr-only">New Chat</span>
      </Button>
    </Tooltip>
  );
}

function ChatHistoryDropdown() {
  const { setChatId } = useChat();
  const [shouldLoadChats, setShouldLoadChats] = useState(false);
  const { data, error, isLoading, mutate } = useChats(shouldLoadChats);

  return (
    <DropdownMenu>
      <Tooltip content="View previous conversations">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onMouseEnter={() => setShouldLoadChats(true)}
            onClick={() => mutate()}
          >
            <HistoryIcon className="size-5" />
            <span className="sr-only">Chat History</span>
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={
            <DropdownMenuItem
              disabled
              className="flex items-center justify-center"
            >
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading chats...
            </DropdownMenuItem>
          }
          errorComponent={
            <DropdownMenuItem disabled>Error loading chats</DropdownMenuItem>
          }
        >
          {data && data.chats.length > 0 ? (
            data.chats.map((chatItem) => (
              <DropdownMenuItem
                key={chatItem.id}
                onSelect={() => {
                  setChatId(chatItem.id);
                }}
              >
                {`Chat from ${new Date(chatItem.createdAt).toLocaleString()}`}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>
              No previous chats found
            </DropdownMenuItem>
          )}
        </LoadingContent>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
