"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { AssistantInlineEmailResponse } from "@/components/assistant-chat/assistant-inline-email-response";
import {
  AddToKnowledgeBase,
  CreatedRuleToolCard,
  PendingDeleteRuleToolCard,
  PendingSaveMemoryToolCard,
  PendingCreateRuleToolCard,
  ForwardEmailResult,
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
import {
  getManageInboxInputForDisplay,
  isStepFailed,
  type ToolLikePart,
} from "@/components/assistant-chat/step-model";
import { requiresThreadIds } from "@/utils/ai/assistant/manage-inbox-actions";
import type { DeleteRuleOutput } from "@/utils/ai/assistant/tools/rules/delete-rule-tool";

interface MessagePartProps {
  disableConfirm: boolean;
  isPersistedMessage: boolean;
  messageId: string;
  part: ChatMessage["parts"][0];
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

type LegacyUpdateRuleStatePart = {
  type: "tool-updateRuleState";
  toolCallId: string;
  state: string;
  input: Parameters<typeof UpdatedRuleState>[0]["args"];
  output?: unknown;
};

type LegacyUpdateRuleStateOutput = Parameters<
  typeof UpdatedRuleState
>[0]["output"];

function isLegacyUpdateRuleStatePart(
  part: unknown,
): part is LegacyUpdateRuleStatePart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "tool-updateRuleState"
  );
}

function ErrorToolCard({ error }: { error: string }) {
  return (
    <div className="text-[13px] text-muted-foreground">Error: {error}</div>
  );
}

function isDeleteRuleOutput(output: unknown): output is DeleteRuleOutput {
  return (
    typeof output === "object" &&
    output !== null &&
    "success" in output &&
    typeof output.success === "boolean"
  );
}

function isLegacyUpdateRuleStateOutput(
  output: unknown,
): output is LegacyUpdateRuleStateOutput {
  return isDeleteRuleOutput(output);
}

function getOutputField<T>(output: unknown, field: string): T | undefined {
  if (typeof output === "object" && output !== null && field in output) {
    return (output as Record<string, unknown>)[field] as T;
  }
}

/**
 * Renders one message part. For a tool part this is only the result card, which
 * sits under the part's node on the step rail; the node itself carries the
 * label, state and failure reason (see step-model.ts).
 */
export function MessagePart({
  part,
  disableConfirm,
  isPersistedMessage,
  messageId,
  threadLookup,
}: MessagePartProps) {
  if (part.type === "text") {
    const text = part.text;
    if (!text) return null;
    return <AssistantInlineEmailResponse>{text}</AssistantInlineEmailResponse>;
  }

  if (part.type === "file") {
    if (part.mediaType.startsWith("image")) {
      return (
        <a
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
      <div className="inline-flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
        {part.filename ?? "File"}
      </div>
    );
  }

  if (!part.type.startsWith("tool-")) return null;
  if (isStepFailed(part as unknown as ToolLikePart)) return null;

  if (part.type === "tool-searchInbox") {
    if (part.state === "output-available") {
      return <SearchInboxResult key={part.toolCallId} output={part.output} />;
    }
    return null;
  }

  if (part.type === "tool-readEmail") {
    if (part.state === "output-available") {
      return <ReadEmailResult key={part.toolCallId} output={part.output} />;
    }
    return null;
  }

  if (part.type === "tool-manageInbox") {
    const { toolCallId, state } = part;
    const input = getManageInboxInputForDisplay(part.input);

    if (state === "input-available") {
      if (
        input &&
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
      return null;
    }
    if (state === "output-available") {
      return (
        <ManageInboxResult
          key={toolCallId}
          input={input ?? undefined}
          output={part.output}
          threadIds={
            input && requiresThreadIds(input.action)
              ? (input.threadIds ?? undefined)
              : undefined
          }
          threadLookup={threadLookup}
        />
      );
    }
    return null;
  }

  if (part.type === "tool-sendEmail") {
    return renderPendingEmailAction({
      part,
      disableConfirm,
      isPersistedMessage,
      messageId,
      ResultComponent: SendEmailResult,
    });
  }

  if (part.type === "tool-replyEmail") {
    return renderPendingEmailAction({
      part,
      disableConfirm,
      isPersistedMessage,
      messageId,
      ResultComponent: ReplyEmailResult,
    });
  }

  if (part.type === "tool-forwardEmail") {
    return renderPendingEmailAction({
      part,
      disableConfirm,
      isPersistedMessage,
      messageId,
      ResultComponent: ForwardEmailResult,
    });
  }

  if (part.type === "tool-createRule") {
    if (part.state !== "output-available") return null;
    const { toolCallId, output } = part;
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
      <CreatedRuleToolCard key={toolCallId} args={part.input} ruleId={ruleId} />
    );
  }

  // These tools are no longer exposed to the assistant; updateRule replaces
  // them. Keep render-only support so older persisted chat messages still show
  // their historical tool cards instead of falling through to raw JSON.
  const legacyRulePart = part as unknown as LegacyRuleToolPart;

  if (legacyRulePart.type === "tool-updateRuleConditions") {
    const { toolCallId, state, output } = legacyRulePart;
    if (state !== "output-available") return null;
    if (!isLegacyUpdateRuleStateOutput(output)) {
      return (
        <ErrorToolCard key={toolCallId} error="Missing rule update details" />
      );
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

  if (legacyRulePart.type === "tool-updateRuleActions") {
    const { toolCallId, state, output } = legacyRulePart;
    if (state !== "output-available") return null;
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

  if (part.type === "tool-updateRule") {
    if (part.state !== "output-available") return null;
    return (
      <UpdatedRule
        key={part.toolCallId}
        args={part.input}
        output={part.output}
      />
    );
  }

  if (part.type === "tool-deleteRule") {
    if (part.state !== "output-available") return null;
    const { toolCallId, output } = part;
    const ruleId = getOutputField<string>(output, "ruleId");
    if (!ruleId)
      return (
        <ErrorToolCard key={toolCallId} error="Missing rule ID in response" />
      );

    const requiresDeleteConfirmation =
      getOutputField<boolean>(output, "requiresConfirmation") === true &&
      getOutputField<string>(output, "actionType") === "delete_rule";
    if (!requiresDeleteConfirmation) return null;
    if (!isDeleteRuleOutput(output)) {
      return (
        <ErrorToolCard
          key={toolCallId}
          error="Missing delete rule confirmation details"
        />
      );
    }

    return (
      <PendingDeleteRuleToolCard
        key={toolCallId}
        args={part.input}
        output={output}
        disableConfirm={disableConfirm || !isPersistedMessage}
      />
    );
  }

  const legacyPart = part as unknown;
  if (isLegacyUpdateRuleStatePart(legacyPart)) {
    const { toolCallId, state, output } = legacyPart;
    if (state !== "output-available") return null;
    if (!isLegacyUpdateRuleStateOutput(output)) {
      return (
        <ErrorToolCard key={toolCallId} error="Missing rule update details" />
      );
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
      if (!isDeleteRuleOutput(output)) {
        return (
          <ErrorToolCard
            key={toolCallId}
            error="Missing delete rule confirmation details"
          />
        );
      }

      return (
        <PendingDeleteRuleToolCard
          key={toolCallId}
          args={legacyPart.input}
          output={output}
          disableConfirm={disableConfirm || !isPersistedMessage}
        />
      );
    }

    return (
      <UpdatedRuleState
        key={toolCallId}
        args={legacyPart.input}
        output={output}
      />
    );
  }

  if (part.type === "tool-updateLearnedPatterns") {
    if (part.state !== "output-available") return null;
    const { toolCallId, output } = part;
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

  if (part.type === "tool-updatePersonalInstructions") {
    if (part.state !== "output-available") return null;
    const updated = getOutputField<string>(part.output, "updated");
    return (
      <UpdatePersonalInstructions
        key={part.toolCallId}
        args={{
          personalInstructions:
            updated ??
            part.input?.personalInstructions ??
            "Personal instructions updated.",
          mode: part.input?.mode ?? "append",
        }}
      />
    );
  }

  if (part.type === "tool-addToKnowledgeBase") {
    if (part.state !== "output-available") return null;
    return <AddToKnowledgeBase key={part.toolCallId} args={part.input} />;
  }

  if (part.type === "tool-saveMemory") {
    if (part.state !== "output-available") return null;
    const { toolCallId, output } = part;
    const requiresConfirmation =
      getOutputField<boolean>(output, "requiresConfirmation") === true &&
      getOutputField<string>(output, "actionType") === "save_memory";
    if (!requiresConfirmation) return null;
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

  if (part.type === "tool-manageSenderCategory") {
    if (part.state !== "output-available") return null;
    return (
      <ManageSenderCategoryResult key={part.toolCallId} output={part.output} />
    );
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

function renderPendingEmailAction({
  part,
  disableConfirm,
  isPersistedMessage,
  messageId,
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
  ResultComponent: (props: {
    output: unknown;
    chatMessageId: string;
    toolCallId: string;
    disableConfirm: boolean;
  }) => ReactNode;
}) {
  if (part.state !== "output-available") return null;

  return (
    <ResultComponent
      key={part.toolCallId}
      output={part.output}
      chatMessageId={messageId}
      toolCallId={part.toolCallId}
      disableConfirm={disableConfirm || !isPersistedMessage}
    />
  );
}
