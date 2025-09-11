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
  UpdateAbout,
  UpdatedLearnedPatterns,
  UpdatedRuleActions,
  UpdatedRuleConditions,
} from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";

interface MessagePartProps {
  part: ChatMessage["parts"][0];
  isStreaming: boolean;
  messageId: string;
  partIndex: number;
}

function ErrorToolCard({ error }: { error: string }) {
  return <div className="rounded border p-2 text-red-500">Error: {error}</div>;
}

export function MessagePart({
  part,
  isStreaming,
  messageId,
  partIndex,
}: MessagePartProps) {
  const key = `${messageId}-${partIndex}`;

  if (part.type === "reasoning") {
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
  if (part.type === "tool-getUserRulesAndSettings") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Reading rules and settings..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if ("error" in output) {
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
      if ("error" in output) {
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
      if ("error" in output) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
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
      if ("error" in output) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
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
      if ("error" in output) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
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
      if ("error" in output) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
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

  if (part.type === "tool-updateAbout") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Updating about..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if ("error" in output) {
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
      if ("error" in output) {
        return <ErrorToolCard key={toolCallId} error={String(output.error)} />;
      }
      return <AddToKnowledgeBase key={toolCallId} args={part.input} />;
    }
  }

  return null;
}
