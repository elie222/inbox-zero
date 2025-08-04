"use client";

import { memo, useState } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import { AnimatePresence, motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import equal from "fast-deep-equal";
import { Markdown } from "./markdown";
import { cn } from "@/utils";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
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
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="group/message mx-auto w-full max-w-3xl px-4"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            "flex w-full gap-4 group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl",
            {
              "w-full": mode === "edit",
              "group-data-[role=user]/message:w-fit": mode !== "edit",
            },
          )}
        >
          {message.role === "assistant" && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex w-full flex-col gap-4">
            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === "reasoning") {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.text}
                  />
                );
              }

              if (type === "text") {
                if (mode === "view") {
                  if (!part.text) return null;

                  return (
                    <div key={key} className="flex flex-row items-start gap-2">
                      <div
                        data-testid="message-content"
                        className={cn("flex flex-col gap-4", {
                          "rounded-xl bg-primary px-3 py-2 text-primary-foreground":
                            message.role === "user",
                        })}
                      >
                        <Markdown>{part.text}</Markdown>
                      </div>
                    </div>
                  );
                }

                if (mode === "edit") {
                  return (
                    <div key={key} className="flex flex-row items-start gap-2">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        regenerate={regenerate}
                      />
                    </div>
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
                    <BasicToolInfo
                      key={toolCallId}
                      text="Read learned patterns"
                    />
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

                  return (
                    <AddToKnowledgeBase key={toolCallId} args={part.input} />
                  );
                }
              }
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
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

export const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="group/message mx-auto w-full max-w-3xl px-4"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cn(
          "flex w-full gap-4 rounded-xl group-data-[role=user]/message:ml-auto group-data-[role=user]/message:w-fit group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:px-3 group-data-[role=user]/message:py-2",
          {
            "group-data-[role=user]/message:bg-muted": true,
          },
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
