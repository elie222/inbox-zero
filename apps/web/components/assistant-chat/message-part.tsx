"use client";

import Image from "next/image";
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
  PendingSaveMemoryToolCard,
  PendingCreateRuleToolCard,
  ForwardEmailResult,
  getManageInboxActionLabel,
  ManageInboxResult,
  ReadEmailResult,
  ReplyEmailResult,
  SearchInboxResult,
  SendEmailResult,
  UpdatePersonalInstructions,
  UpdatedLearnedPatterns,
  UpdatedRuleActions,
  UpdatedRuleConditions,
} from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";
import type { ThreadLookup } from "@/components/assistant-chat/tools";
import { formatToolLabel } from "@/components/assistant-chat/tool-label";
import { requiresThreadIds } from "@/utils/ai/assistant/manage-inbox-actions";

interface MessagePartProps {
  disableConfirm: boolean;
  hideInlineEmailCards: boolean;
  isPersistedMessage: boolean;
  isStreaming: boolean;
  messageId: string;
  part: ChatMessage["parts"][0];
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
  disableConfirm,
  hideInlineEmailCards,
  isPersistedMessage,
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
    const text =
      hideInlineEmailCards && part.text
        ? stripInlineEmailSections(part.text)
        : part.text;
    if (!text) return null;
    return <Response key={key}>{text}</Response>;
  }

  if (part.type === "file") {
    if (part.mediaType.startsWith("image")) {
      return (
        <a
          key={key}
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block"
        >
          <Image
            src={part.url}
            alt={part.filename ?? "attachment"}
            width={256}
            height={256}
            className="max-h-64 max-w-full rounded-lg border object-contain"
            unoptimized
          />
        </a>
      );
    }
    return (
      <div
        key={key}
        className="inline-flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm"
      >
        {part.filename ?? "File"}
      </div>
    );
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
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Loaded assistant capabilities" />
      ),
    });
  }

  if (part.type === "tool-updateAssistantSettings") {
    return renderToolStatus({
      part,
      loadingText: "Updating settings...",
      renderSuccess: ({ toolCallId, output }) => {
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
            text={`Updated settings${
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
      return <ReadEmailResult key={toolCallId} output={output} />;
    }
  }

  if (part.type === "tool-manageInbox") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      if (
        (part.input.action === "bulk_archive_senders" ||
          part.input.action === "unsubscribe_senders") &&
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

      const actionText = getManageInboxActionLabel({
        action: part.input.action,
        read: part.input.read ?? true,
        labelApplied:
          part.input.action === "archive_threads"
            ? Boolean(part.input.label)
            : Boolean(part.input.label || part.input.labelName),
        inProgress: true,
      });

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
            requiresThreadIds(part.input.action)
              ? (part.input.threadIds ?? undefined)
              : undefined
          }
          threadLookup={threadLookup}
        />
      );
    }
  }

  if (part.type === "tool-sendEmail") {
    return renderPendingEmailAction({
      part,
      disableConfirm,
      isPersistedMessage,
      messageId,
      preparingText: "Preparing email...",
      ResultComponent: SendEmailResult,
    });
  }

  if (part.type === "tool-replyEmail") {
    return renderPendingEmailAction({
      part,
      disableConfirm,
      isPersistedMessage,
      messageId,
      preparingText: "Preparing reply...",
      ResultComponent: ReplyEmailResult,
    });
  }

  if (part.type === "tool-forwardEmail") {
    return renderPendingEmailAction({
      part,
      disableConfirm,
      isPersistedMessage,
      messageId,
      preparingText: "Preparing forward...",
      ResultComponent: ForwardEmailResult,
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
      const requiresRuleConfirmation =
        getOutputField<boolean>(output, "requiresConfirmation") === true &&
        getOutputField<string>(output, "actionType") === "create_rule";
      const confirmationState =
        getOutputField<string>(output, "confirmationState") || "";
      if (
        requiresRuleConfirmation &&
        (confirmationState === "pending" || confirmationState === "processing")
      ) {
        return (
          <PendingCreateRuleToolCard
            key={toolCallId}
            args={part.input}
            output={output}
            chatMessageId={messageId}
            toolCallId={toolCallId}
            disableConfirm={disableConfirm || !isPersistedMessage}
          />
        );
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

  if (part.type === "tool-updatePersonalInstructions") {
    return renderToolStatus({
      part,
      loadingText: "Updating personal instructions...",
      renderSuccess: ({ toolCallId, output }) => {
        const updated = getOutputField<string>(output, "updated");
        return (
          <UpdatePersonalInstructions
            key={toolCallId}
            args={{
              personalInstructions:
                updated ??
                part.input?.personalInstructions ??
                "Personal instructions updated.",
              mode: part.input?.mode ?? "append",
            }}
          />
        );
      },
    });
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

      const requiresConfirmation =
        getOutputField<boolean>(output, "requiresConfirmation") === true &&
        getOutputField<string>(output, "actionType") === "save_memory";

      if (requiresConfirmation) {
        return (
          <PendingSaveMemoryToolCard
            key={toolCallId}
            output={output}
            chatMessageId={messageId}
            toolCallId={toolCallId}
            disableConfirm={disableConfirm || !isPersistedMessage}
          />
        );
      }

      return <BasicToolInfo key={toolCallId} text="Memory saved" />;
    }
  }

  if (part.type === "tool-searchMemories") {
    return renderToolStatus({
      part,
      loadingText: "Searching memories...",
      renderSuccess: ({ toolCallId, output }) => {
        const memories = getOutputField<Array<unknown>>(output, "memories");
        const memoriesCount = Array.isArray(memories) ? memories.length : null;
        if (memoriesCount === 0) {
          return null;
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

const INLINE_EMAIL_SECTION_RE =
  /\n{0,2}##[^\n]*\n\s*<emails>[\s\S]*?<\/emails>/g;
const INLINE_EMAIL_BLOCK_RE = /\n{0,2}<emails>[\s\S]*?<\/emails>/g;

function stripInlineEmailSections(text: string) {
  return text
    .replace(INLINE_EMAIL_SECTION_RE, "")
    .replace(INLINE_EMAIL_BLOCK_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getInProgressManageInboxOutput(input: {
  action: string;
  fromEmails?: string[] | null;
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
    const failureMessage = getToolFailureMessage(part.output);
    if (failureMessage) {
      return <ErrorToolCard key={part.toolCallId} error={failureMessage} />;
    }

    return renderSuccess({ toolCallId: part.toolCallId, output: part.output });
  }

  return null;
}

function renderPendingEmailAction({
  part,
  disableConfirm,
  isPersistedMessage,
  messageId,
  preparingText,
  ResultComponent,
}: {
  part: {
    toolCallId: string;
    state: string;
    output?: unknown;
  };
  disableConfirm: boolean;
  isPersistedMessage: boolean;
  messageId: string;
  preparingText: string;
  ResultComponent: (props: {
    output: unknown;
    chatMessageId: string;
    toolCallId: string;
    disableConfirm: boolean;
  }) => ReactNode;
}) {
  const { toolCallId, state } = part;
  if (state === "input-available") {
    return <BasicToolInfo key={toolCallId} text={preparingText} />;
  }

  if (state === "output-available") {
    const failureMessage = getToolFailureMessage(part.output);
    if (failureMessage) {
      return <ErrorToolCard key={toolCallId} error={failureMessage} />;
    }

    return (
      <ResultComponent
        key={toolCallId}
        output={part.output}
        chatMessageId={messageId}
        toolCallId={toolCallId}
        disableConfirm={disableConfirm || !isPersistedMessage}
      />
    );
  }

  return null;
}

function getToolFailureMessage(output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null;

  const record = output as Record<string, unknown>;
  if (isOutputWithError(output)) {
    return toFailureMessage(record.error);
  }

  if (record.success === false) {
    return (
      toFailureMessage(record.message) ??
      toFailureMessage(record.reason) ??
      toFailureMessage(record.error) ??
      "Operation failed"
    );
  }

  return null;
}

function toFailureMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  ) {
    return value.message;
  }
  return null;
}
