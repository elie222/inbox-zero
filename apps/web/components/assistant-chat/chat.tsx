"use client";

import { useEffect, useState } from "react";
import { HistoryIcon, Loader2, PlusIcon } from "lucide-react";
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

const MAX_MESSAGES = 20;

export function Chat() {
  const { chat, chatId, input, setInput, handleSubmit, setNewChat } = useChat();
  const { messages, status, stop, regenerate, setMessages } = chat;
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    "",
  );

  useEffect(() => {
    if (!chatId) {
      setNewChat();
    }
  }, [chatId, setNewChat]);

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

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex items-center justify-between px-2 pt-2">
        <div>
          <SidebarTrigger name="chat-sidebar" />
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
          {/* <OpenArtifactButton /> */}
        </div>
      </div>

      <Messages
        status={status}
        messages={messages}
        setMessages={setMessages}
        setInput={setInput}
        regenerate={regenerate}
        isArtifactVisible={false}
      />

      <div className="mx-auto w-full px-4 pb-4 md:max-w-3xl md:pb-6">
        <PromptInput
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && status === "ready") {
              handleSubmit();
              setLocalStorageInput("");
            }
          }}
          className="relative"
        >
          <PromptInputTextarea
            value={input}
            placeholder="Send a message..."
            onChange={(e) => setInput(e.currentTarget.value)}
            className="pr-12"
          />
          <PromptInputSubmit
            status={
              status === "streaming"
                ? "streaming"
                : status === "submitted"
                  ? "submitted"
                  : "ready"
            }
            disabled={!input.trim() || status !== "ready"}
            className="absolute bottom-1 right-1"
            onClick={(e) => {
              if (status === "streaming") {
                e.preventDefault();
                stop();
                setMessages((messages) => messages);
              }
            }}
          />
        </PromptInput>
      </div>
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
