"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpIcon,
  HistoryIcon,
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
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useLocalStorage } from "usehooks-ts";
import { useSession } from "@/utils/auth-client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/components/assistant-chat/types";
import type { MessageContext } from "@/app/api/chat/validation";

export function Chat({ open }: { open: boolean }) {
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

  return (
    <div
      className="flex h-full min-w-0 flex-col"
      style={
        {
          "--chat-px": "1.5rem",
          "--chat-max-w": "800px",
        } as React.CSSProperties
      }
    >
      <ChatTopBar
        messages={messages}
        hasMessages={hasMessages}
        setInput={setInput}
      />
      {hasMessages ? (
        <ChatMessagesView
          status={status}
          messages={messages}
          setMessages={setMessages}
          setInput={setInput}
          regenerate={regenerate}
          context={context}
          setContext={setContext}
          inputArea={inputArea}
        />
      ) : (
        <NewChatView
          firstName={firstName}
          inputArea={inputArea}
          onSuggestionClick={(text) => {
            chat.sendMessage({
              role: "user",
              parts: [{ type: "text", text }],
            });
            setLocalStorageInput("");
          }}
        />
      )}
    </div>
  );
}

function ChatMessagesView({
  status,
  messages,
  setMessages,
  setInput,
  regenerate,
  context,
  setContext,
  inputArea,
}: {
  status: UseChatHelpers<ChatMessage>["status"];
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  setInput: (input: string) => void;
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  context: MessageContext | null;
  setContext: (context: MessageContext | null) => void;
  inputArea: React.ReactNode;
}) {
  return (
    <>
      <div className="pointer-events-none h-2 -mb-2 z-10 bg-gradient-to-b from-background to-transparent" />
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
            <div className="relative z-10">{inputArea}</div>
            <div className="absolute w-full bottom-0 h-20 bg-background pointer-events-none" />
          </>
        }
      />
    </>
  );
}

const CHAT_EXAMPLES = [
  "Help me handle my inbox today",
  "Clean up my inbox",
  "Auto-archive newsletters for me",
];

function NewChatView({
  firstName,
  inputArea,
  onSuggestionClick,
}: {
  firstName: string | undefined;
  inputArea: React.ReactNode;
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-[var(--chat-px)]">
      <div className="w-full max-w-[var(--chat-max-w)]">
        <h1 className="mb-6 text-center text-2xl sm:text-3xl md:text-4xl font-extralight tracking-tight">
          {getGreeting(firstName)}
        </h1>
        {inputArea}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {CHAT_EXAMPLES.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onSuggestionClick(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatTopBar({
  messages,
  hasMessages,
  setInput,
}: {
  messages: ChatMessage[];
  hasMessages: boolean;
  setInput: (input: string) => void;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[calc(var(--chat-max-w)+var(--chat-px)*2)] px-[var(--chat-px)] pt-2">
      <div className="flex items-center justify-end gap-1">
        {hasMessages ? (
          <>
            <NewChatButton />
            <ExamplesDialog setInput={setInput} />
            <ChatHistoryDropdown />
          </>
        ) : (
          <ChatHistoryDropdown />
        )}
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

function getGreeting(firstName: string | undefined): string {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : "";
  if (hour < 5) return `Hey there${name}`;
  if (hour < 12) return `Good morning${name}`;
  if (hour < 18) return `Good afternoon${name}`;
  return `Good evening${name}`;
}
