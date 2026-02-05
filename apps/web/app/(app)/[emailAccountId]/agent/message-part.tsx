"use client";

import { Response } from "@/components/ai-elements/response";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type { AgentChatMessage } from "./types";
import {
  BasicToolInfo,
  SearchEmailsResult,
  GetEmailResult,
  ModifyEmailsResult,
  DraftReplyResult,
  SendEmailResult,
  UpdateSettingsResult,
  PatternResult,
  OnboardingCompleteResult,
} from "./tools";
import { LabelsPreview } from "@/components/labels-preview";

interface MessagePartProps {
  part: AgentChatMessage["parts"][0];
  isStreaming: boolean;
  messageId: string;
  partIndex: number;
}

function ErrorToolCard({ error }: { error: string }) {
  return <div className="rounded border p-2 text-red-500">Error: {error}</div>;
}

function isOutputWithError(output: unknown): output is { error: unknown } {
  return typeof output === "object" && output !== null && "error" in output;
}

export function MessagePart({
  part,
  isStreaming,
  messageId,
  partIndex,
}: MessagePartProps) {
  const key = `${messageId}-${partIndex}`;

  if (part.type === "reasoning") {
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

  if (part.type === "tool-searchEmails") {
    if (part.state === "input-available") {
      return (
        <BasicToolInfo
          key={part.toolCallId}
          text={`Searching emails for "${part.input.query}"...`}
        />
      );
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
      return <SearchEmailsResult key={part.toolCallId} output={part.output} />;
    }
  }

  if (part.type === "tool-getEmail") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Loading email..." />;
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
      return <GetEmailResult key={part.toolCallId} output={part.output} />;
    }
  }

  if (part.type === "tool-modifyEmails") {
    if (part.state === "input-available") {
      return (
        <BasicToolInfo key={part.toolCallId} text="Applying email actions..." />
      );
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
      return <ModifyEmailsResult key={part.toolCallId} output={part.output} />;
    }
  }

  if (part.type === "tool-draftReply") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Drafting reply..." />;
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
      return <DraftReplyResult key={part.toolCallId} output={part.output} />;
    }
  }

  if (part.type === "tool-sendEmail") {
    if (part.state === "input-available") {
      return (
        <BasicToolInfo key={part.toolCallId} text="Preparing to send..." />
      );
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
      return <SendEmailResult key={part.toolCallId} output={part.output} />;
    }
  }

  if (part.type === "tool-getSkill") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Loading skill..." />;
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
      return <BasicToolInfo key={part.toolCallId} text="Loaded skill" />;
    }
  }

  if (part.type === "tool-createSkill") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Creating skill..." />;
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
      return <BasicToolInfo key={part.toolCallId} text="Skill created" />;
    }
  }

  if (part.type === "tool-updateSkill") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Updating skill..." />;
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
      return <BasicToolInfo key={part.toolCallId} text="Skill updated" />;
    }
  }

  if (part.type === "tool-createPattern") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Creating pattern..." />;
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
      return <PatternResult key={part.toolCallId} text="Pattern created" />;
    }
  }

  if (part.type === "tool-removePattern") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Removing pattern..." />;
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
      return <PatternResult key={part.toolCallId} text="Pattern removed" />;
    }
  }

  if (part.type === "tool-getSettings") {
    if (part.state === "input-available") {
      return <BasicToolInfo key={part.toolCallId} text="Loading settings..." />;
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
      return <BasicToolInfo key={part.toolCallId} text="Loaded settings" />;
    }
  }

  if (part.type === "tool-updateSettings") {
    if (part.state === "input-available") {
      return (
        <BasicToolInfo key={part.toolCallId} text="Updating settings..." />
      );
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
      return (
        <UpdateSettingsResult key={part.toolCallId} output={part.output} />
      );
    }
  }

  if (part.type === "tool-completeOnboarding") {
    if (part.state === "input-available") {
      return (
        <BasicToolInfo key={part.toolCallId} text="Activating your agent..." />
      );
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
      return <OnboardingCompleteResult key={part.toolCallId} />;
    }
  }

  if (part.type === "tool-showSetupPreview") {
    if (part.state === "output-available") {
      if (isOutputWithError(part.output)) {
        return (
          <ErrorToolCard
            key={part.toolCallId}
            error={String(part.output.error)}
          />
        );
      }
      const output = part.output as {
        labels: { name: string; actions: string[] }[];
      };
      return <LabelsPreview key={part.toolCallId} items={output.labels} />;
    }
    return null;
  }

  if (part.type === "tool-bulkArchive") {
    if (part.state === "input-available") {
      return (
        <BasicToolInfo
          key={part.toolCallId}
          text={`Archiving emails from ${part.input.senders.length} senders...`}
        />
      );
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
      return (
        <BasicToolInfo
          key={part.toolCallId}
          text={`Archived ${part.output.archived} emails from ${part.output.senders} senders`}
        />
      );
    }
  }

  return null;
}
