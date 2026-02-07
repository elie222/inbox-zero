"use client";

import { useEffect } from "react";
import { Messages } from "./messages";
import { ExamplesDialog } from "@/components/assistant-chat/examples-dialog";
import { useChat } from "@/providers/ChatProvider";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useLocalStorage } from "usehooks-ts";
import { NewChatButton, ChatHistoryDropdown } from "@/components/chat-history";

const MAX_MESSAGES = 20;

export function Chat({ open }: { open: boolean }) {
  const {
    chat,
    chatId,
    input,
    setInput,
    setChatId,
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

  return (
    <div className="flex h-full min-w-0 flex-col bg-gradient-to-t from-blue-100 from-0% via-blue-100/30 via-10% to-transparent to-25% dark:bg-background">
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
          <NewChatButton onNewChat={setNewChat} />
          <ExamplesDialog setInput={setInput} />
          <ChatHistoryDropdown setChatId={setChatId} />
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
            disabled={(!input.trim() && !context) || status !== "ready"}
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
