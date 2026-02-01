"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ai-elements/loader";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

const initialMessages: UIMessage[] = [
  {
    id: "assistant-onboarding-intro",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hey! I'm excited to help you take control of your inbox.\n\nWhat brings you here today?",
      },
    ],
  },
];

export function AgentOnboardingChat() {
  const { emailAccountId } = useAccount();
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status, stop } = useAiChat({
    transport: new DefaultChatTransport({
      api: "/api/agent/onboarding",
      headers: emailAccountId
        ? { [EMAIL_ACCOUNT_HEADER]: emailAccountId }
        : undefined,
    }),
    experimental_throttle: 100,
  });
  const didSeedMessages = useRef(false);

  useEffect(() => {
    if (didSeedMessages.current || messages.length > 0) return;
    setMessages(initialMessages);
    didSeedMessages.current = true;
  }, [messages.length, setMessages]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <Conversation className="flex min-w-0 flex-1">
        <ConversationContent className="mx-auto flex h-full w-full flex-col gap-6 p-0 px-4 pt-0 md:max-w-3xl">
          {messages.map((message) => {
            const text = getMessageText(message);

            return (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {text ? <Response>{text}</Response> : null}
                </MessageContent>
              </Message>
            );
          })}

          {status === "submitted" &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "user" && (
              <Message from="assistant">
                <MessageContent>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader />
                    <span>Thinking...</span>
                  </div>
                </MessageContent>
              </Message>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full px-4 pb-4 md:max-w-3xl md:pb-6">
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            if (!emailAccountId || status !== "ready" || !input.trim()) return;
            sendMessage({
              role: "user",
              parts: [
                {
                  type: "text",
                  text: input.trim(),
                },
              ],
            });
            setInput("");
          }}
          className="relative"
        >
          <PromptInputTextarea
            value={input}
            placeholder=""
            onChange={(event) => setInput(event.currentTarget.value)}
            className="pr-12"
          />
          <PromptInputSubmit
            status={
              status === "streaming"
                ? "streaming"
                : status === "submitted"
                  ? "submitted"
                  : status === "error"
                    ? "error"
                    : "ready"
            }
            disabled={
              !emailAccountId || (!input.trim() && status !== "streaming")
            }
            className="absolute bottom-1 right-1"
            onClick={(event) => {
              if (status === "streaming") {
                event.preventDefault();
                stop();
              }
            }}
          />
        </PromptInput>
      </div>
    </div>
  );
}

function getMessageText(message: UIMessage) {
  if (message.parts?.length) {
    const text = message.parts
      .filter(isTextPart)
      .map((part) => part.text)
      .join("\n\n");

    if (text) return text;
  }

  return "";
}

type TextPart = { type: "text"; text: string };

function isTextPart(part: unknown): part is TextPart {
  if (!part || typeof part !== "object") return false;
  const typed = part as { type?: string; text?: string };
  return typed.type === "text" && typeof typed.text === "string";
}
