"use client";

import { useState } from "react";
import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { Messages } from "./messages";
import type { AgentChatMessage } from "./types";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

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
  const [chatId] = useState(generateUUID());

  const chat = useAiChat<AgentChatMessage>({
    id: chatId,
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

  return (
    <div className="flex h-full min-w-0 flex-col">
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
            minHeight={24}
            maxHeight={180}
          />
          <PromptInputSubmit status={chat.status} />
        </PromptInput>
      </div>
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
