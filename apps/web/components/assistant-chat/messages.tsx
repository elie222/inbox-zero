import { PreviewMessage } from "./message";
import { Overview } from "./overview";
import { memo } from "react";
import equal from "fast-deep-equal";
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
}

function PureMessages({
  status,
  messages,
  setMessages,
  regenerate,
  setInput,
}: MessagesProps) {
  return (
    <Conversation className="flex min-w-0 flex-1">
      <ConversationContent className="flex flex-col gap-6 pt-0">
        {messages.length === 0 && <Overview setInput={setInput} />}

        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            message={message}
            isLoading={status === "streaming" && messages.length - 1 === index}
            setMessages={setMessages}
            regenerate={regenerate}
          />
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

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;

  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.status && nextProps.status) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;

  return true;
});
