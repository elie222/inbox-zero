"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import { MessagePart } from "@/app/(app)/[emailAccountId]/agent/message-part";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { AgentChatMessage } from "@/app/(app)/[emailAccountId]/agent/types";

const KICKOFF_TEXT = "__onboarding_start__";

export function AgentOnboardingChat() {
  const { emailAccountId } = useAccount();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop } = useAiChat<AgentChatMessage>({
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
  const didKickOff = useRef(false);

  useEffect(() => {
    if (didKickOff.current || !emailAccountId) return;
    didKickOff.current = true;
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: KICKOFF_TEXT }],
    });
  }, [emailAccountId, sendMessage]);

  const visibleMessages = messages.filter(
    (m) =>
      !(
        m.role === "user" &&
        m.parts?.length === 1 &&
        m.parts[0].type === "text" &&
        m.parts[0].text === KICKOFF_TEXT
      ),
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <Conversation className="flex min-w-0 flex-1">
        <ConversationContent className="mx-auto flex h-full w-full flex-col gap-6 p-0 px-4 pt-8 md:max-w-3xl md:pt-12">
          {visibleMessages.map((message) => (
            <AssistantLabel key={message.id} from={message.role}>
              <Message from={message.role}>
                <MessageContent className="text-base">
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
            </AssistantLabel>
          ))}

          {((status === "submitted" || status === "streaming") &&
            !visibleMessages.some(
              (m) => m.role === "assistant" && m.parts?.length,
            )) ||
          (status === "submitted" &&
            visibleMessages.length > 0 &&
            visibleMessages[visibleMessages.length - 1].role === "user") ? (
            <AssistantLabel from="assistant">
              <Message from="assistant">
                <MessageContent className="text-base">
                  <span className="text-muted-foreground">Thinking...</span>
                </MessageContent>
              </Message>
            </AssistantLabel>
          ) : null}
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
              parts: [{ type: "text", text: input.trim() }],
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

function AssistantLabel({
  from,
  children,
}: {
  from: string;
  children: React.ReactNode;
}) {
  if (from !== "assistant") return <>{children}</>;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <MessageAvatar
          src="/icons/icon-192x192.png"
          name="IZ"
          className="size-6"
        />
        <span className="text-xs font-medium text-muted-foreground">
          Inbox Zero
        </span>
      </div>
      {children}
    </div>
  );
}
