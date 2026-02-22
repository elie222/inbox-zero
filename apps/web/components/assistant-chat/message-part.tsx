"use client";

import type { ReactNode } from "react";
import { Response } from "@/components/ai-elements/response";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  AddToKnowledgeBase,
  BasicToolInfo,
  CreatedRuleToolCard,
  ManageInboxResult,
  SearchInboxResult,
  UpdateAbout,
  UpdatedLearnedPatterns,
  UpdatedRuleActions,
  UpdatedRuleConditions,
} from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";
import type { ThreadLookup } from "@/components/assistant-chat/tools";
import { formatToolLabel } from "@/components/assistant-chat/tool-label";

interface MessagePartProps {
  part: ChatMessage["parts"][0];
  isStreaming: boolean;
  messageId: string;
  partIndex: number;
  threadLookup: ThreadLookup;
}

function ErrorToolCard({ error }: { error: string }) {
  return <div className="rounded border p-2 text-red-500">Error: {error}</div>;
}

function isOutputWithError(output: unknown): output is { error: unknown } {
  return typeof output === "object" && output !== null && "error" in output;
}

function getOutputField<T>(output: unknown, field: string): T | undefined {
  if (typeof output === "object" && output !== null && field in output) {
    return (output as Record<string, unknown>)[field] as T;
  }
  return undefined;
}

export function MessagePart({
  part,
  isStreaming,
  messageId,
  partIndex,
  threadLookup,
}: MessagePartProps) {
  const key = `${messageId}-${partIndex}`;

  if (part.type === "reasoning") {
    // Skip rendering if reasoning is redacted (limited token output from provider)
    if (!part.text || part.text === "[REDACTED]") return null;
    return (
      <Reasoning key={key} isStreaming={isStreaming} className="w-full">
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "text") {
    if (!part.text) return null;
    return <Response key={key}>{part.text}</Response>;
  }

  // Tool handling
  if (part.type === "tool-getAccountOverview") {
    return renderToolStatus({
      part,
      loadingText: "Loading account overview...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Loaded account overview" />
      ),
    });
  }

  if (part.type === "tool-getAssistantCapabilities") {
    return renderToolStatus({
      part,
      loadingText: "Loading assistant capabilities...",
      renderSuccess: ({ toolCallId, output }) => {
        const capabilities = getOutputField<Array<unknown>>(
          output,
          "capabilities",
        );
        return (
          <BasicToolInfo
            key={toolCallId}
            text={`Loaded assistant capabilities${
              Array.isArray(capabilities)
                ? ` (${capabilities.length} available)`
                : ""
            }`}
          />
        );
      },
    });
  }

  if (part.type === "tool-updateAssistantSettings") {
    return renderToolStatus({
      part,
      loadingText: "Updating settings...",
      renderSuccess: ({ toolCallId, output }) => {
        const dryRun = getOutputField<boolean>(output, "dryRun");
        const appliedChanges = getOutputField<Array<unknown>>(
          output,
          "appliedChanges",
        );
        const appliedChangesCount = Array.isArray(appliedChanges)
          ? appliedChanges.length
          : null;
        return (
          <BasicToolInfo
            key={toolCallId}
            text={`${dryRun ? "Prepared settings changes" : "Updated settings"}${
              appliedChangesCount !== null
                ? ` (${appliedChangesCount} change${
                    appliedChangesCount === 1 ? "" : "s"
                  })`
                : ""
            }`}
          />
        );
      },
    });
  }

  if (part.type === "tool-searchInbox") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Searching inbox..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <SearchInboxResult key={toolCallId} output={output} />;
    }
  }

  if (part.type === "tool-readEmail") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Reading email..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      const subject = getOutputField<string>(output, "subject");
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Read email${subject ? `: ${subject}` : ""}`}
        />
      );
    }
  }

  if (part.type === "tool-manageInbox") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      if (
        part.input.action === "bulk_archive_senders" &&
        part.input.fromEmails?.length
      ) {
        return (
          <ManageInboxResult
            key={toolCallId}
            input={part.input}
            output={getInProgressManageInboxOutput(part.input)}
            threadLookup={threadLookup}
            isInProgress
          />
        );
      }

      let actionText = "Updating emails...";
      if (part.input.action === "archive_threads") {
        actionText = part.input.labelId
          ? "Archiving and labeling emails..."
          : "Archiving emails...";
      } else if (part.input.action === "mark_read_threads") {
        actionText =
          part.input.read === false
            ? "Marking emails as unread..."
            : "Marking emails as read...";
      }

      return <BasicToolInfo key={toolCallId} text={actionText} />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return (
        <ManageInboxResult
          key={toolCallId}
          input={part.input}
          output={output}
          threadIds={
            part.input.action !== "bulk_archive_senders"
              ? part.input.threadIds
              : undefined
          }
          threadLookup={threadLookup}
        />
      );
    }
  }

  if (part.type === "tool-updateInboxFeatures") {
    return renderToolStatus({
      part,
      loadingText: "Updating inbox features...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Updated inbox features" />
      ),
    });
  }

  if (part.type === "tool-sendEmail") {
    return renderToolStatus({
      part,
      loadingText: "Sending email...",
      renderSuccess: ({ toolCallId, output }) => {
        const to = getOutputField<string>(output, "to");
        return (
          <BasicToolInfo
            key={toolCallId}
            text={`Sent email${to ? ` to ${to}` : ""}`}
          />
        );
      },
    });
  }

  if (part.type === "tool-replyEmail") {
    return renderToolStatus({
      part,
      loadingText: "Sending reply...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Sent reply" />
      ),
    });
  }

  if (part.type === "tool-forwardEmail") {
    return renderToolStatus({
      part,
      loadingText: "Forwarding email...",
      renderSuccess: ({ toolCallId, output }) => {
        const to = getOutputField<string>(output, "to");
        return (
          <BasicToolInfo
            key={toolCallId}
            text={`Forwarded email${to ? ` to ${to}` : ""}`}
          />
        );
      },
    });
  }

  if (part.type === "tool-getUserRulesAndSettings") {
    return renderToolStatus({
      part,
      loadingText: "Reading rules and settings...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Read rules and settings" />
      ),
    });
  }

  if (part.type === "tool-getLearnedPatterns") {
    return renderToolStatus({
      part,
      loadingText: "Reading learned patterns...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Read learned patterns" />
      ),
    });
  }

  if (part.type === "tool-createRule") {
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
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      return (
        <CreatedRuleToolCard
          key={toolCallId}
          args={part.input}
          ruleId={ruleId}
        />
      );
    }
  }

  if (part.type === "tool-updateRuleConditions") {
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
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId)
        return (
          <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
        );
      return (
        <UpdatedRuleConditions
          key={toolCallId}
          args={part.input}
          ruleId={ruleId}
          originalConditions={getOutputField(output, "originalConditions")}
          updatedConditions={getOutputField(output, "updatedConditions")}
        />
      );
    }
  }

  if (part.type === "tool-updateRuleActions") {
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
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId)
        return (
          <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
        );
      return (
        <UpdatedRuleActions
          key={toolCallId}
          args={part.input}
          ruleId={ruleId}
          originalActions={getOutputField(output, "originalActions")}
          updatedActions={getOutputField(output, "updatedActions")}
        />
      );
    }
  }

  if (part.type === "tool-updateLearnedPatterns") {
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
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId)
        return (
          <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
        );
      return (
        <UpdatedLearnedPatterns
          key={toolCallId}
          args={part.input}
          ruleId={ruleId}
        />
      );
    }
  }

  if (part.type === "tool-updateAbout") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Updating about..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <UpdateAbout key={toolCallId} args={part.input} />;
    }
  }

  if (part.type === "tool-addToKnowledgeBase") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Adding to knowledge base..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <AddToKnowledgeBase key={toolCallId} args={part.input} />;
    }
  }

  if (part.type === "tool-saveMemory") {
    return renderToolStatus({
      part,
      loadingText: "Saving memory...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Memory saved" />
      ),
    });
  }

  if (part.type === "tool-searchMemories") {
    return renderToolStatus({
      part,
      loadingText: "Searching memories...",
      renderSuccess: ({ toolCallId, output }) => {
        const memories = getOutputField<Array<unknown>>(output, "memories");
        const memoriesCount = Array.isArray(memories) ? memories.length : null;
        if (memoriesCount === 0) {
          return <BasicToolInfo key={toolCallId} text="No memories found" />;
        }
        return (
          <BasicToolInfo
            key={toolCallId}
            text={`Found ${memoriesCount ?? "matching"} memories`}
          />
        );
      },
    });
  }

  if (part.type.startsWith("tool-")) {
    const toolPart = part as {
      type: `tool-${string}`;
      toolCallId: string;
      state: string;
      output?: unknown;
    };
    const toolLabel = formatToolLabel(toolPart.type);
    return renderToolStatus({
      part: toolPart,
      loadingText: `Running ${toolLabel}...`,
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text={`Completed ${toolLabel}`} />
      ),
    });
  }

  return null;
}

function getInProgressManageInboxOutput(input: {
  action: string;
  fromEmails?: string[];
}) {
  return {
    action: input.action,
    senders: input.fromEmails ?? [],
    sendersCount: input.fromEmails?.length ?? 0,
  };
}

function renderToolStatus({
  part,
  loadingText,
  renderSuccess,
}: {
  part: {
    toolCallId: string;
    state: string;
    output?: unknown;
  };
  loadingText: string;
  renderSuccess: (args: { toolCallId: string; output: unknown }) => ReactNode;
}) {
  if (part.state === "input-available") {
    return <BasicToolInfo key={part.toolCallId} text={loadingText} />;
  }

  if (part.state === "output-available") {
    if (isOutputWithError(part.output)) {
      return (
        <ErrorToolCard
          key={part.toolCallId}
          error={String(part.output.error)}
        />
      );
    }

    return renderSuccess({ toolCallId: part.toolCallId, output: part.output });
  }

  return null;
}
