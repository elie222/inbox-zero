import { Fragment, useMemo, type ReactNode } from "react";
import { Overview } from "./overview";
import { MessagePart } from "./message-part";
import { MessagingChannelHint } from "./messaging-channel-hint";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/components/assistant-chat/types";
import {
  EmailLookupProvider,
  type EmailLookup,
} from "@/components/assistant-chat/email-lookup-context";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { SearchInboxResult } from "@/components/assistant-chat/tools";

interface MessagesProps {
  footer?: ReactNode;
  isArtifactVisible: boolean;
  messages: Array<ChatMessage>;
  persistedMessageIds: Set<string>;
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  setInput: (input: string) => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  status: UseChatHelpers<ChatMessage>["status"];
}

export function Messages({
  status,
  messages,
  persistedMessageIds,
  setInput,
  footer,
}: MessagesProps) {
  const disableConfirm = status === "streaming" || status === "submitted";
  const emailLookup = useMemo(() => buildEmailLookup(messages), [messages]);
  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages],
  );

  return (
    <EmailLookupProvider value={emailLookup}>
      <Conversation className="flex min-w-0 flex-1">
        <ConversationContent
          className="mx-auto flex min-h-full flex-col max-w-[calc(var(--chat-max-w)+var(--chat-px)*2)] px-[var(--chat-px)] pt-0 pb-0"
          scrollClassName="![scrollbar-gutter:auto] scrollbar-thin"
        >
          <div className="flex flex-1 flex-col gap-4">
            {messages.length === 0 && <Overview setInput={setInput} />}

            {messages.map((message, index) => (
              <Fragment key={message.id}>
                <Message from={message.role}>
                  <MessageContent variant="flat">
                    {message.parts?.map((part, partIndex) => {
                      if (isToolRunContinuation(message.parts, partIndex)) {
                        return null;
                      }
                      if (part.type === "tool-searchInbox") {
                        const outputs = getToolRunOutputs(
                          message.parts,
                          partIndex,
                        );
                        if (outputs.length > 1) {
                          return (
                            <SearchInboxResult
                              key={`${message.id}-${partIndex}`}
                              outputs={outputs}
                            />
                          );
                        }
                      }
                      return (
                        <MessagePart
                          key={`${message.id}-${partIndex}`}
                          part={part}
                          isStreaming={
                            status === "streaming" &&
                            partIndex === message.parts.length - 1
                          }
                          disableConfirm={disableConfirm}
                          isPersistedMessage={persistedMessageIds.has(
                            message.id,
                          )}
                          messageId={message.id}
                          partIndex={partIndex}
                          threadLookup={emailLookup}
                        />
                      );
                    })}
                  </MessageContent>
                </Message>
                {index === firstAssistantIndex && <MessagingChannelHint />}
              </Fragment>
            ))}

            {status === "submitted" &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "user" && (
                <Message from="assistant">
                  <MessageContent variant="flat">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader />
                      <span>Thinking...</span>
                    </div>
                  </MessageContent>
                </Message>
              )}
          </div>

          <div className="h-8 shrink-0" />

          {footer && (
            <div className="sticky bottom-0 z-10 pb-4 md:pb-6 pointer-events-none [&>*]:pointer-events-auto relative">
              <ConversationScrollButton wrapperClassName="absolute bottom-full left-1/2 -translate-x-1/2 mb-2" />
              {footer}
            </div>
          )}
        </ConversationContent>
      </Conversation>
    </EmailLookupProvider>
  );
}

function buildEmailLookup(messages: Array<ChatMessage>): EmailLookup {
  const lookup: EmailLookup = new Map();
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (
        part.type === "tool-searchInbox" &&
        part.state === "output-available"
      ) {
        const output = part.output as Record<string, unknown> | undefined;
        const items = output?.messages as
          | Array<{
              messageId: string;
              threadId: string;
              from: string;
              subject: string;
              snippet: string;
              date: string;
              isUnread: boolean;
              externalUrl?: string;
            }>
          | undefined;
        if (!items) continue;
        for (const item of items) {
          if (!lookup.has(item.threadId)) {
            lookup.set(item.threadId, {
              messageId: item.messageId,
              from: item.from,
              subject: item.subject,
              snippet: item.snippet,
              date: item.date,
              isUnread: item.isUnread,
              externalUrl: item.externalUrl,
            });
          }
        }
      }
    }
  }
  return lookup;
}

// Back-to-back calls to these tools collapse into one row: status-only tools
// would repeat an identical line, and searches merge into one expandable list.
const STATUS_ONLY_TOOL_TYPES = new Set([
  "tool-getUserRulesAndSettings",
  "tool-getRuleExecutionForMessage",
  "tool-testRulesOnEmail",
  "tool-getLearnedPatterns",
]);

function isToolRunContinuation(
  parts: ChatMessage["parts"],
  index: number,
): boolean {
  const part = parts[index];
  const previous = findPreviousVisiblePart(parts, index);
  if (!previous || previous.type !== part.type) return false;
  if (part.type === "tool-searchInbox") {
    return isFinishedToolPart(previous) && isFinishedToolPart(part);
  }
  return (
    STATUS_ONLY_TOOL_TYPES.has(part.type) &&
    isSuccessfulToolPart(previous) &&
    isSuccessfulToolPart(part)
  );
}

function getToolRunOutputs(
  parts: ChatMessage["parts"],
  start: number,
): unknown[] {
  const outputs: unknown[] = [];
  for (let i = start; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "step-start") continue;
    if (i > start && !isToolRunContinuation(parts, i)) break;
    if ("output" in part) outputs.push(part.output);
  }
  return outputs;
}

// Multi-step responses insert invisible step-start parts between sequential tool calls.
function findPreviousVisiblePart(parts: ChatMessage["parts"], index: number) {
  for (let i = index - 1; i >= 0; i--) {
    if (parts[i].type !== "step-start") return parts[i];
  }
  return;
}

function isFinishedToolPart(part: ChatMessage["parts"][number]) {
  return "state" in part && part.state === "output-available";
}

function isSuccessfulToolPart(part: ChatMessage["parts"][number]) {
  if (!isFinishedToolPart(part)) return false;
  const output = "output" in part ? part.output : undefined;
  return !(output && typeof output === "object" && "error" in output);
}
