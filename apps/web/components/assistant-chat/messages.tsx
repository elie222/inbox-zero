import { Trans } from "@lingui/react/macro";
import { Fragment, useMemo, type ReactNode } from "react";
import { Overview } from "./overview";
import { MessagePart } from "./message-part";
import { ActivityGroup } from "./activity-group";
import { MessagingChannelHint } from "./messaging-channel-hint";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/components/assistant-chat/types";
import {
  EmailLookupProvider,
  KnownThreadIdsProvider,
  collectToolThreadIds,
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
import { isToolErrorHiddenFromUser } from "@/utils/ai/assistant/tool-error-visibility";

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
  const knownThreadIds = useMemo(
    () => collectToolThreadIds(messages),
    [messages],
  );
  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages],
  );

  return (
    <EmailLookupProvider value={emailLookup}>
      <KnownThreadIdsProvider value={knownThreadIds}>
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
                      {groupActivity(message.parts ?? []).map((segment) => {
                        const renderPart = (partIndex: number) =>
                          renderMessagePart({
                            message,
                            partIndex,
                            status,
                            disableConfirm,
                            isPersistedMessage: persistedMessageIds.has(
                              message.id,
                            ),
                            emailLookup,
                          });
                        if (segment.type === "part") {
                          return renderPart(segment.partIndex);
                        }
                        const isLastMessage = index === messages.length - 1;
                        return (
                          <ActivityGroup
                            key={`${message.id}-activity-${segment.partIndexes[0]}`}
                            stepCount={segment.stepCount}
                            isActive={
                              isLastMessage &&
                              status === "streaming" &&
                              segment.isTrailing
                            }
                          >
                            {segment.partIndexes.map(renderPart)}
                          </ActivityGroup>
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
                        <span>
                          <Trans>Thinking...</Trans>
                        </span>
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
      </KnownThreadIdsProvider>
    </EmailLookupProvider>
  );
}

function renderMessagePart({
  message,
  partIndex,
  status,
  disableConfirm,
  isPersistedMessage,
  emailLookup,
}: {
  message: ChatMessage;
  partIndex: number;
  status: UseChatHelpers<ChatMessage>["status"];
  disableConfirm: boolean;
  isPersistedMessage: boolean;
  emailLookup: EmailLookup;
}) {
  const parts = message.parts;
  const part = parts[partIndex];
  const key = `${message.id}-${partIndex}`;
  if (isToolRunContinuation(parts, partIndex)) return null;
  if (part.type === "tool-searchInbox") {
    const outputs = getToolRunOutputs(parts, partIndex);
    if (
      !outputs.length &&
      "output" in part &&
      isToolErrorHiddenFromUser(part.output)
    ) {
      return null;
    }
    if (
      outputs.length > 1 ||
      ("output" in part && isToolErrorHiddenFromUser(part.output))
    ) {
      return <SearchInboxResult key={key} outputs={outputs} />;
    }
  }
  return (
    <MessagePart
      key={key}
      part={part}
      isStreaming={status === "streaming" && partIndex === parts.length - 1}
      disableConfirm={disableConfirm}
      isPersistedMessage={isPersistedMessage}
      messageId={message.id}
      partIndex={partIndex}
      threadLookup={emailLookup}
    />
  );
}

type PartSegment =
  | { type: "part"; partIndex: number }
  | {
      type: "activity";
      partIndexes: number[];
      stepCount: number;
      isTrailing: boolean;
    };

// Thinking and read-only lookups are the assistant's working steps, not
// results, so back-to-back runs of them fold into one collapsed row. Anything
// that changes the user's data or asks them something stays visible.
const ACTIVITY_TOOL_TYPES = new Set([
  "tool-searchInbox",
  "tool-readEmail",
  "tool-readAttachment",
  "tool-getUserRulesAndSettings",
  "tool-getRuleExecutionForMessage",
  "tool-testRulesOnEmail",
  "tool-getLearnedPatterns",
  "tool-getAccountOverview",
  "tool-getAssistantCapabilities",
  "tool-getSenderCategoryOverview",
  "tool-getSenderCategorizationStatus",
  "tool-searchMemories",
  "tool-getCalendarEvents",
]);

function groupActivity(parts: ChatMessage["parts"]): PartSegment[] {
  const segments: PartSegment[] = [];
  let run: number[] = [];

  const flushRun = (isTrailing: boolean) => {
    const stepCount = run.filter((i) => isVisibleActivityStep(parts[i])).length;
    if (stepCount >= 2) {
      segments.push({
        type: "activity",
        partIndexes: run,
        stepCount,
        isTrailing,
      });
    } else {
      for (const partIndex of run) segments.push({ type: "part", partIndex });
    }
    run = [];
  };

  parts.forEach((part, partIndex) => {
    if (part.type === "step-start" || isActivityPart(part)) {
      run.push(partIndex);
      return;
    }
    flushRun(false);
    segments.push({ type: "part", partIndex });
  });
  flushRun(true);

  return segments;
}

function isActivityPart(part: ChatMessage["parts"][number]) {
  if (part.type === "reasoning") return true;
  if (!ACTIVITY_TOOL_TYPES.has(part.type)) return false;
  // Search failures already render inside the search card, which merges
  // neighbouring searches, so they fold with them.
  if (part.type === "tool-searchInbox") return true;
  // Any other failed lookup the user should see is not routine work.
  const output = "output" in part ? part.output : undefined;
  return !(
    output &&
    typeof output === "object" &&
    "error" in output &&
    !isToolErrorHiddenFromUser(output)
  );
}

function isVisibleActivityStep(part: ChatMessage["parts"][number]) {
  if (part.type === "step-start") return false;
  // A call that threw renders nothing, so it isn't a step the user can see.
  if ("state" in part && part.state === "output-error") return false;
  if (part.type === "reasoning") {
    return !!part.text && part.text !== "[REDACTED]";
  }
  return !("output" in part && isToolErrorHiddenFromUser(part.output));
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
    // Hidden errors are for the model to correct, not for the user's card.
    if ("output" in part && !isToolErrorHiddenFromUser(part.output)) {
      outputs.push(part.output);
    }
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
