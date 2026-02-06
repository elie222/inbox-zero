"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader } from "@/components/ai-elements/loader";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { MessagePart } from "@/app/(app)/[emailAccountId]/agent/message-part";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { AgentChatMessage } from "@/app/(app)/[emailAccountId]/agent/types";

export function AgentOnboardingChat() {
  const { emailAccountId } = useAccount();
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status, stop } =
    useAiChat<AgentChatMessage>({
      transport: new DefaultChatTransport({
        api: "/api/agent/chat",
        headers: emailAccountId
          ? { [EMAIL_ACCOUNT_HEADER]: emailAccountId }
          : undefined,
        prepareSendMessagesRequest({ messages, id, body }) {
          return {
            body: {
              id,
              message: messages.at(-1),
              context: { mode: "onboarding" },
              ...body,
            },
          };
        },
      }),
      experimental_throttle: 100,
    });
  const didSeedMessages = useRef(false);

  const initialMessages = useMemo(() => {
    return buildInitialMessages();
  }, []);

  useEffect(() => {
    if (didSeedMessages.current || messages.length > 0) return;
    setMessages(initialMessages);
    didSeedMessages.current = true;
  }, [messages.length, setMessages, initialMessages]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <Conversation className="flex min-w-0 flex-1">
        <ConversationContent className="mx-auto flex h-full w-full flex-col gap-6 p-0 px-4 pt-0 md:max-w-3xl">
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts?.map((part, index) => (
                  <MessagePart
                    key={`${message.id}-${index}`}
                    part={part}
                    isStreaming={status === "streaming"}
                    messageId={message.id}
                    partIndex={index}
                  />
                ))}
              </MessageContent>
            </Message>
          ))}

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

function buildInitialMessages(): AgentChatMessage[] {
  return [
    {
      id: "assistant-onboarding-intro",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `Hey! I'm your inbox assistant. I'd love to learn a bit about you so I can set things up the right way.

What do you do, and what brought you to Inbox Zero?`,
        },
      ],
    },
  ];
}
