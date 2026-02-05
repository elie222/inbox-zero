import type { UseChatHelpers } from "@ai-sdk/react";
import type { AgentChatMessage } from "./types";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { MessagePart } from "./message-part";

interface MessagesProps {
  status: UseChatHelpers<AgentChatMessage>["status"];
  messages: Array<AgentChatMessage>;
}

export function Messages({ status, messages }: MessagesProps) {
  return (
    <Conversation className="flex min-w-0 flex-1">
      <ConversationContent className="flex flex-col gap-6 pt-0 h-full">
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
  );
}
