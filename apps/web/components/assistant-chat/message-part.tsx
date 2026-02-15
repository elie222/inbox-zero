"use client";

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
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Loading account overview..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <BasicToolInfo key={toolCallId} text="Loaded account overview" />;
    }
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
      let actionText = "Updating emails...";
      if (part.input.action === "bulk_archive_senders") {
        actionText = "Bulk archiving by sender...";
      } else if (part.input.action === "archive_threads") {
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
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Updating inbox features..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <BasicToolInfo key={toolCallId} text="Updated inbox features" />;
    }
  }

  if (part.type === "tool-sendEmail") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Sending email..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      const to = getOutputField<string>(output, "to");
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Sent email${to ? ` to ${to}` : ""}`}
        />
      );
    }
  }

  if (part.type === "tool-getUserRulesAndSettings") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Reading rules and settings..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <BasicToolInfo key={toolCallId} text="Read rules and settings" />;
    }
  }

  if (part.type === "tool-getLearnedPatterns") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Reading learned patterns..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <BasicToolInfo key={toolCallId} text="Read learned patterns" />;
    }
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
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Saving memory..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <BasicToolInfo key={toolCallId} text="Memory saved" />;
    }
  }

  return null;
}
