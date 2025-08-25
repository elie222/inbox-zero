"use client";

import { memo, useState } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { MessageEditor } from "./message-editor";
import {
  AddToKnowledgeBase,
  BasicToolInfo,
  CreatedRuleToolCard,
  UpdateAbout,
  UpdatedLearnedPatterns,
  UpdatedRuleActions,
  UpdatedRuleConditions,
} from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";

const PurePreviewMessage = ({
  message,
  isLoading,
  setMessages,
  regenerate,
}: {
  message: ChatMessage;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <Message from={message.role} data-testid={`message-${message.role}`}>
      <MessageContent>
        {message.parts?.map((part, index) => {
          const { type } = part;
          const key = `message-${message.id}-part-${index}`;

          if (type === "reasoning") {
            return (
              <Reasoning key={key} isStreaming={isLoading} className="w-full">
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }

          if (type === "text") {
            if (mode === "view") {
              if (!part.text) return null;

              return <Response key={key}>{part.text}</Response>;
            }

            if (mode === "edit") {
              return (
                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
                  regenerate={regenerate}
                />
              );
            }
          }

          if (type === "tool-getUserRulesAndSettings") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text="Reading rules and settings..."
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return (
                <BasicToolInfo
                  key={toolCallId}
                  text="Read rules and settings"
                />
              );
            }
          }

          if (type === "tool-getLearnedPatterns") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text="Reading learned patterns..."
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return (
                <BasicToolInfo key={toolCallId} text="Read learned patterns" />
              );
            }
          }

          if (type === "tool-createRule") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text={`Creating rule "${part.input.name}"...`}
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return (
                <CreatedRuleToolCard
                  key={toolCallId}
                  args={part.input}
                  ruleId={output.ruleId}
                />
              );
            }
          }

          if (type === "tool-updateRuleConditions") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text={`Updating rule "${part.input.ruleName}" conditions...`}
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return (
                <UpdatedRuleConditions
                  key={toolCallId}
                  args={part.input}
                  ruleId={output.ruleId}
                  originalConditions={output.originalConditions}
                  updatedConditions={output.updatedConditions}
                />
              );
            }
          }

          if (type === "tool-updateRuleActions") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text={`Updating rule "${part.input.ruleName}" actions...`}
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return (
                <UpdatedRuleActions
                  key={toolCallId}
                  args={part.input}
                  ruleId={output.ruleId}
                  originalActions={output.originalActions}
                  updatedActions={output.updatedActions}
                />
              );
            }
          }

          if (type === "tool-updateLearnedPatterns") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text={`Updating learned patterns for rule "${part.input.ruleName}"...`}
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return (
                <UpdatedLearnedPatterns
                  key={toolCallId}
                  args={part.input}
                  ruleId={output.ruleId}
                />
              );
            }
          }

          if (type === "tool-updateAbout") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo key={toolCallId} text="Updating about..." />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return <UpdateAbout key={toolCallId} args={part.input} />;
            }
          }

          if (type === "tool-addToKnowledgeBase") {
            const { toolCallId, state } = part;

            if (state === "input-available") {
              return (
                <BasicToolInfo
                  key={toolCallId}
                  text="Adding to knowledge base..."
                />
              );
            }

            if (state === "output-available") {
              const { output } = part;

              if ("error" in output) {
                return (
                  <ErrorToolCard
                    key={toolCallId}
                    error={String(output.error)}
                  />
                );
              }

              return <AddToKnowledgeBase key={toolCallId} args={part.input} />;
            }
          }
        })}
      </MessageContent>
    </Message>
  );
};

function ErrorToolCard({ error }: { error: string }) {
  return <div className="rounded border p-2 text-red-500">Error: {error}</div>;
}

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;

    return true;
  },
);
