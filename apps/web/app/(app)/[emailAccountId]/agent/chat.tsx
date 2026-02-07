"use client";

import { useCallback, useEffect, useState } from "react";
import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { Messages } from "./messages";
import type { AgentChatMessage } from "./types";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { NewChatButton, ChatHistoryDropdown } from "@/components/chat-history";
import { useChatMessages } from "@/hooks/useChatMessages";

export function AgentChat({
  mode = "chat",
  emailId,
  dryRun,
}: {
  mode?: "chat" | "onboarding" | "processing_email" | "test";
  emailId?: string;
  dryRun?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | null>(generateUUID);

  const { data: chatData } = useChatMessages(chatId, "AGENT");

  const chat = useAiChat<AgentChatMessage>({
    id: chatId ?? undefined,
    transport: new DefaultChatTransport({
      api: "/api/agent/chat",
      headers: {
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            context: { mode, emailId, dryRun },
            ...body,
          },
        };
      },
    }),
    experimental_throttle: 100,
    generateId: generateUUID,
  });

  useEffect(() => {
    chat.setMessages(chatData ? convertToAgentMessages(chatData) : []);
  }, [chat.setMessages, chatData]);

  const handleNewChat = useCallback(() => {
    setChatId(generateUUID());
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setChatId(id);
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-end gap-1 px-2 pt-2">
        <NewChatButton onNewChat={handleNewChat} />
        <ChatHistoryDropdown setChatId={handleSelectChat} type="AGENT" />
      </div>

      <Messages status={chat.status} messages={chat.messages} />

      <div className="mx-auto w-full px-4 pb-4 md:max-w-3xl md:pb-6">
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim() && chat.status === "ready") {
              chat.sendMessage({
                role: "user",
                parts: [{ type: "text", text: input.trim() }],
              });
              setInput("");
            }
          }}
          className="relative"
        >
          <PromptInputTextarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask the agent to help with your inbox..."
            className="pr-12"
          />
          <PromptInputSubmit
            status={chat.status}
            disabled={!input.trim() || chat.status !== "ready"}
            className="absolute bottom-1 right-1"
          />
        </PromptInput>
      </div>
    </div>
  );
}

function convertToAgentMessages(
  chat: NonNullable<Awaited<ReturnType<typeof useChatMessages>>["data"]>,
): AgentChatMessage[] {
  return (
    chat?.messages.map((message) => ({
      id: message.id,
      role: message.role as UIMessage<AgentChatMessage>["role"],
      parts: message.parts as AgentChatMessage["parts"],
    })) || []
  );
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
