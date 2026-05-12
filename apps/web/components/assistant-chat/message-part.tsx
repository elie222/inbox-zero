"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { AssistantInlineEmailResponse } from "@/components/assistant-chat/assistant-inline-email-response";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  AddToKnowledgeBase,
  BasicToolInfo,
  CreatedRuleToolCard,
  PendingDeleteRuleToolCard,
  PendingSaveMemoryToolCard,
  PendingCreateRuleToolCard,
  ForwardEmailResult,
  getManageInboxActionLabel,
  ManageInboxResult,
  ManageSenderCategoryResult,
  ReadEmailResult,
  ReplyEmailResult,
  SearchInboxResult,
  SendEmailResult,
  UpdatePersonalInstructions,
  UpdatedLearnedPatterns,
  UpdatedRule,
  UpdatedRuleActions,
  UpdatedRuleConditions,
  UpdatedRuleState,
} from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";
import type { ThreadLookup } from "@/components/assistant-chat/tools";
import { formatToolLabel } from "@/components/assistant-chat/tool-label";
import {
  isManageInboxAction,
  type ManageInboxAction,
  requiresThreadIds,
} from "@/utils/ai/assistant/manage-inbox-actions";
import { getUserVisibleToolFailureMessage } from "@/utils/ai/assistant/chat-response-guard";
import { pluralize } from "@/utils/string";

interface MessagePartProps {
  disableConfirm: boolean;
  isPersistedMessage: boolean;
  isStreaming: boolean;
  messageId: string;
  part: ChatMessage["parts"][0];
  partIndex: number;
  threadLookup: ThreadLookup;
}

type LegacyRuleToolPart =
  | {
      type: "tool-updateRuleConditions";
      toolCallId: string;
      state: string;
      input: Parameters<typeof UpdatedRuleConditions>[0]["args"];
      output?: unknown;
    }
  | {
      type: "tool-updateRuleActions";
      toolCallId: string;
      state: string;
      input: Parameters<typeof UpdatedRuleActions>[0]["args"];
      output?: unknown;
    };

type ManageInboxInputForDisplay = {
  action: ManageInboxAction;
  fromEmails?: string[] | null;
  label?: string | null;
  labelName?: string | null;
  read?: boolean | null;
  threadIds?: string[] | null;
};

function ErrorToolCard({ error }: { error: string }) {
  return <div className="text-xs text-muted-foreground">Error: {error}</div>;
}

function renderToolError(toolCallId: string, output: unknown) {
  const failureMessage = getToolFailureMessage(output);
  return failureMessage ? (
    <ErrorToolCard key={toolCallId} error={failureMessage} />
  ) : null;
}

function isOutputWithError(output: unknown): output is { error: unknown } {
  return typeof output === "object" && output !== null && "error" in output;
}

function getOutputField<T>(output: unknown, field: string): T | undefined {
  if (typeof output === "object" && output !== null && field in output) {
    return (output as Record<string, unknown>)[field] as T;
  }
}

export function MessagePart({
  part,
  isStreaming,
  disableConfirm,
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
    const text = part.text;
    if (!text) return null;
    return (
      <AssistantInlineEmailResponse key={key}>
        {text}
      </AssistantInlineEmailResponse>
    );
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
      return <SearchInboxResult key={toolCallId} output={part.output} />;
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
        return renderToolError(toolCallId, output);
      }
      return <ReadEmailResult key={toolCallId} output={output} />;
    }
  }

  if (part.type === "tool-manageInbox") {
    const { toolCallId, state } = part;
    const input = getManageInboxInputForDisplay(part.input);

    if (state === "input-available") {
      if (!input) {
        return <BasicToolInfo key={toolCallId} text="Updating inbox..." />;
      }

      if (
        (input.action === "bulk_archive_senders" ||
          input.action === "unsubscribe_senders") &&
        input.fromEmails?.length
      ) {
        return (
          <ManageInboxResult
            key={toolCallId}
            input={input}
            output={getInProgressManageInboxOutput(input)}
            threadLookup={threadLookup}
            isInProgress
          />
        );
      }

      const actionText = getManageInboxActionLabel({
        action: input.action,
        read: input.read ?? true,
        labelApplied:
          input.action === "archive_threads"
            ? Boolean(input.label)
            : Boolean(input.label || input.labelName),
        inProgress: true,
      });

      return <BasicToolInfo key={toolCallId} text={actionText} />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return renderToolError(toolCallId, output);
      }
      return (
        <ManageInboxResult
          key={toolCallId}
          input={input ?? undefined}
          output={output}
          threadIds={
            input && requiresThreadIds(input.action)
              ? (input.threadIds ?? undefined)
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

  if (part.type === "tool-getRuleExecutionForMessage") {
    return renderToolStatus({
      part,
      loadingText: "Reading rule execution details...",
      renderSuccess: ({ toolCallId }) => (
        <BasicToolInfo key={toolCallId} text="Read rule execution details" />
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
        return renderToolError(toolCallId, output);
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

  // These tools are no longer exposed to the assistant; updateRule replaces
  // them. Keep render-only support so older persisted chat messages still show
  // their historical tool cards instead of falling through to raw JSON.
  const legacyRulePart = part as unknown as LegacyRuleToolPart;

  if (legacyRulePart.type === "tool-updateRuleConditions") {
    const { toolCallId, state } = legacyRulePart;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Updating rule "${legacyRulePart.input.ruleName}" conditions...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = legacyRulePart;
      if (isOutputWithError(output)) {
        return renderToolError(toolCallId, output);
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId)
        return (
          <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
        );
      return (
        <UpdatedRuleConditions
          key={toolCallId}
          args={legacyRulePart.input}
          ruleId={ruleId}
          originalConditions={getOutputField(output, "originalConditions")}
          updatedConditions={getOutputField(output, "updatedConditions")}
        />
      );
    }
  }

  if (legacyRulePart.type === "tool-updateRuleActions") {
    const { toolCallId, state } = legacyRulePart;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Updating rule "${legacyRulePart.input.ruleName}" actions...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = legacyRulePart;
      if (isOutputWithError(output)) {
        return renderToolError(toolCallId, output);
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId)
        return (
          <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
        );
      return (
        <UpdatedRuleActions
          key={toolCallId}
          args={legacyRulePart.input}
          ruleId={ruleId}
          originalActions={getOutputField(output, "originalActions")}
          updatedActions={getOutputField(output, "updatedActions")}
        />
      );
    }
  }

  if (part.type === "tool-updateRule") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Updating rule "${part.input.ruleName}"...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return renderToolError(toolCallId, output);
      }
      return <UpdatedRule key={toolCallId} args={part.input} output={output} />;
    }
  }

  if (part.type === "tool-updateRuleState") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      const verb =
        part.input.operation === "delete"
          ? "Preparing to delete"
          : part.input.operation === "enable"
            ? "Enabling"
            : "Disabling";
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`${verb} rule "${part.input.ruleName}"...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return renderToolError(toolCallId, output);
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId)
        return (
          <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
        );

      const requiresDeleteConfirmation =
        getOutputField<boolean>(output, "requiresConfirmation") === true &&
        getOutputField<string>(output, "actionType") === "delete_rule";
      if (requiresDeleteConfirmation) {
        return (
          <PendingDeleteRuleToolCard
            key={toolCallId}
            args={part.input}
            output={output}
            disableConfirm={disableConfirm || !isPersistedMessage}
          />
        );
      }

      return (
        <UpdatedRuleState key={toolCallId} args={part.input} output={output} />
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
        return renderToolError(toolCallId, output);
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
        return renderToolError(toolCallId, output);
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
        return renderToolError(toolCallId, output);
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

  if (part.type === "tool-getSenderCategoryOverview") {
    return renderToolStatus({
      part,
      loadingText: "Checking sender categories...",
      renderSuccess: ({ toolCallId, output }) => (
        <BasicToolInfo
          key={toolCallId}
          text={getSenderCategoryOverviewSuccessText(output)}
        />
      ),
    });
  }

  if (part.type === "tool-startSenderCategorization") {
    return renderToolStatus({
      part,
      loadingText: "Starting sender categorization...",
      renderSuccess: ({ toolCallId, output }) => (
        <BasicToolInfo
          key={toolCallId}
          text={getStartSenderCategorizationSuccessText(output)}
        />
      ),
    });
  }

  if (part.type === "tool-getSenderCategorizationStatus") {
    return renderToolStatus({
      part,
      loadingText: "Checking categorization progress...",
      renderSuccess: ({ toolCallId, output }) => (
        <BasicToolInfo
          key={toolCallId}
          text={getSenderCategorizationStatusSuccessText(output)}
        />
      ),
    });
  }

  if (part.type === "tool-manageSenderCategory") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      const categoryName = part.input.categoryName?.trim();
      return (
        <BasicToolInfo
          key={toolCallId}
          text={
            categoryName
              ? `Archiving "${categoryName}" category...`
              : "Archiving category..."
          }
        />
      );
    }
    if (state === "output-available") {
      const failureMessage = getToolFailureMessage(part.output);
      if (failureMessage) {
        return <ErrorToolCard key={toolCallId} error={failureMessage} />;
      }
      return (
        <ManageSenderCategoryResult key={toolCallId} output={part.output} />
      );
    }
    return null;
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
      renderSuccess: ({ toolCallId, output }) => (
        <BasicToolInfo
          key={toolCallId}
          text={getToolSuccessMessage(output) ?? `Completed ${toolLabel}`}
        />
      ),
    });
  }

  return null;
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

function getManageInboxInputForDisplay(
  input: unknown,
): ManageInboxInputForDisplay | null {
  if (typeof input !== "object" || input === null) return null;

  const value = input as Record<string, unknown>;
  const action = normalizeManageInboxActionForDisplay(value.action);
  if (!action) return null;

  return {
    action,
    fromEmails: getOptionalStringArray(value.fromEmails),
    label: getOptionalString(value.label),
    labelName: getOptionalString(value.labelName ?? value.categoryName),
    read: typeof value.read === "boolean" ? value.read : undefined,
    threadIds: getOptionalStringArray(value.threadIds),
  };
}

function normalizeManageInboxActionForDisplay(action: unknown) {
  if (typeof action !== "string") return;
  if (action === "categorize_threads") return "label_threads";
  return isManageInboxAction(action) ? action : undefined;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getOptionalStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
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
  return getUserVisibleToolFailureMessage(output);
}

function getToolSuccessMessage(output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null;
  return toMessageString((output as Record<string, unknown>).message);
}

function getSenderCategoryOverviewSuccessText(output: unknown): string {
  const categories = getOutputField<Array<unknown>>(output, "categories");
  const categoryCount = Array.isArray(categories) ? categories.length : 0;
  const uncategorized =
    getOutputField<number>(output, "uncategorizedSenderCount") ?? 0;

  if (categoryCount === 0 && uncategorized === 0) {
    return "No sender categories yet";
  }

  const parts: string[] = [];
  if (categoryCount > 0) {
    parts.push(
      `${categoryCount} ${pluralize(categoryCount, "category", "categories")}`,
    );
  }
  if (uncategorized > 0) {
    parts.push(
      `${uncategorized} uncategorized ${pluralize(uncategorized, "sender", "senders")}`,
    );
  }
  return `Found ${parts.join(", ")}`;
}

function getStartSenderCategorizationSuccessText(output: unknown): string {
  const alreadyRunning = getOutputField<boolean>(output, "alreadyRunning");
  const totalQueued = getOutputField<number>(output, "totalQueuedSenders") ?? 0;

  if (alreadyRunning) {
    return "Sender categorization already in progress";
  }
  if (totalQueued > 0) {
    return `Categorizing ${totalQueued} ${pluralize(totalQueued, "sender", "senders")}`;
  }
  return "No senders to categorize";
}

function getSenderCategorizationStatusSuccessText(output: unknown): string {
  const status = getOutputField<string>(output, "status");
  const total = getOutputField<number>(output, "totalItems") ?? 0;
  const completed = getOutputField<number>(output, "completedItems") ?? 0;

  if (status === "completed") {
    return "Categorization complete";
  }
  if (status === "running") {
    return `Categorizing senders (${completed} of ${total})`;
  }
  return "Categorization hasn't started";
}

function toMessageString(value: unknown): string | null {
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
