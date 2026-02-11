import type { ReactNode } from "react";
import { Overview } from "./overview";
import { MessagePart } from "./message-part";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/components/assistant-chat/types";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";

interface MessagesProps {
  status: UseChatHelpers<ChatMessage>["status"];
  messages: Array<ChatMessage>;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isArtifactVisible: boolean;
  setInput: (input: string) => void;
  footer?: ReactNode;
}

export function Messages({
  status,
  messages,
  setInput,
  footer,
}: MessagesProps) {
  return (
    <Conversation className="flex min-w-0 flex-1">
      <ConversationContent
        className="mx-auto flex min-h-full flex-col max-w-[var(--chat-max-w)] px-[var(--chat-px)] pt-0 pb-0"
        scrollClassName="![scrollbar-gutter:auto] scrollbar-thin"
      >
        <div className="flex flex-1 flex-col gap-6 pb-24">
          {messages.length === 0 && <Overview setInput={setInput} />}

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
        </div>

        {footer && (
          <div className="sticky bottom-0 z-10 pb-4 md:pb-6 pointer-events-none [&>*]:pointer-events-auto">
            <div className="flex justify-center">
              <ConversationScrollButton className="static translate-x-0 mb-2" />
            </div>
            {footer}
          </div>
        )}
      </ConversationContent>
    </Conversation>
  );
}
