import type { ModelMessage } from "ai";
import { ActionType, type LogicalOperator } from "@/generated/prisma/enums";
import type { getEmailAccount } from "@/__tests__/helpers";
import type { MessageContext } from "@/app/api/chat/validation";
import { writeEvalDebugArtifact } from "@/__tests__/eval/debug-artifacts";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";

export type RecordedToolCall = {
  toolName: string;
  input: unknown;
  output?: unknown;
};

export type UpdateRuleActionsInput = {
  ruleName: string;
  actions: Array<{
    type: ActionType;
    fields?: {
      label?: string | null;
    } | null;
    delayInMinutes?: number | null;
  }>;
};

export type UpdateRuleInput = {
  ruleName: string;
  updates: {
    name?: string;
    enabled?: boolean;
    condition?: {
      aiInstructions?: string;
      clearAiInstructions?: true;
      static?: {
        from?: string | null;
        to?: string | null;
        subject?: string | null;
      } | null;
      conditionalOperator?: LogicalOperator | null;
    };
    actions?: UpdateRuleActionsInput["actions"];
  };
};

export type AssistantChatTrace = {
  debugArtifactPath?: string | null;
  finalText: string;
  resolvedModels: unknown[];
  steps: unknown[];
  toolCalls: RecordedToolCall[];
  stepTexts: string[];
};

export async function captureAssistantChatTrace({
  emailAccount,
  messages,
  logger,
  inboxStats,
  context,
  chatHasHistory,
  chatLastSeenRulesRevision,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
  logger: Logger;
  inboxStats?: { total: number; unread: number } | null;
  context?: MessageContext;
  chatHasHistory?: boolean;
  chatLastSeenRulesRevision?: number | null;
}) {
  const recordedToolCalls: RecordedToolCall[] = [];
  const stepTexts: string[] = [];
  const steps: unknown[] = [];
  const resolvedModels: unknown[] = [];

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId: emailAccount.id,
    user: emailAccount,
    inboxStats,
    context,
    chatHasHistory,
    chatLastSeenRulesRevision,
    logger,
    onStepFinish: async (step) => {
      steps.push(step);

      const { text, toolCalls } = step;
      if (text?.trim()) {
        stepTexts.push(text.trim());
      }

      for (const toolCall of toolCalls || []) {
        const output = step.toolResults?.find(
          (toolResult) => toolResult.toolCallId === toolCall.toolCallId,
        )?.output;

        recordedToolCalls.push({
          toolName: toolCall.toolName,
          input: toolCall.input,
          output,
        });
      }
    },
    onModelResolved: (resolvedModel) => {
      resolvedModels.push(resolvedModel);
    },
  });

  await result.consumeStream();
  const finalText = await Promise.resolve(result.text);

  const debugArtifactPath = writeEvalDebugArtifact({
    kind: "assistant-chat-trace",
    data: {
      emailAccountId: emailAccount.id,
      provider: emailAccount.account.provider,
      model: emailAccount.user.aiModel,
      messages,
      inboxStats,
      context,
      resolvedModels,
      steps,
      toolCalls: recordedToolCalls,
      finalText,
    },
  });

  return {
    debugArtifactPath,
    finalText,
    resolvedModels,
    steps,
    toolCalls: recordedToolCalls,
    stepTexts,
  };
}

export async function captureAssistantChatToolCalls(
  args: Parameters<typeof captureAssistantChatTrace>[0],
) {
  const trace = await captureAssistantChatTrace(args);
  return trace.toolCalls;
}

export function summarizeRecordedToolCalls(
  toolCalls: RecordedToolCall[],
  summarizeToolCall: (toolCall: RecordedToolCall) => string,
) {
  return toolCalls.length > 0
    ? toolCalls.map(summarizeToolCall).join(" | ")
    : "no tool calls";
}

export function getFirstMatchingToolCall<TInput>(
  toolCalls: RecordedToolCall[],
  toolName: string,
  matches: (input: unknown) => input is TInput,
) {
  for (let index = 0; index < toolCalls.length; index += 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== toolName) continue;
    if (!matches(toolCall.input)) continue;

    return {
      index,
      input: toolCall.input,
    };
  }

  return null;
}

export function getLastMatchingToolCall<TInput>(
  toolCalls: RecordedToolCall[],
  toolName: string,
  matches: (input: unknown) => input is TInput,
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== toolName) continue;
    if (!matches(toolCall.input)) continue;

    return {
      index,
      input: toolCall.input,
    };
  }

  return null;
}

export function isUpdateRuleActionsInput(
  input: unknown,
): input is UpdateRuleActionsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    ruleName?: unknown;
    actions?: unknown;
  };

  return typeof value.ruleName === "string" && Array.isArray(value.actions);
}

export function isUpdateRuleInput(input: unknown): input is UpdateRuleInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    ruleName?: unknown;
    updates?: unknown;
  };

  return (
    typeof value.ruleName === "string" &&
    typeof value.updates === "object" &&
    value.updates !== null
  );
}

export function getLastRuleActionsUpdate(toolCalls: RecordedToolCall[]) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== "updateRule") continue;
    if (!isUpdateRuleInput(toolCall.input)) continue;
    if (!toolCall.input.updates.actions) continue;

    return {
      index,
      ruleName: toolCall.input.ruleName,
      actions: toolCall.input.updates.actions,
    };
  }

  return null;
}

export function getLastRuleConditionUpdate(toolCalls: RecordedToolCall[]) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== "updateRule") continue;
    if (!isUpdateRuleInput(toolCall.input)) continue;
    if (!toolCall.input.updates.condition) continue;

    return {
      index,
      ruleName: toolCall.input.ruleName,
      condition: toolCall.input.updates.condition,
    };
  }

  return null;
}

export type UpdateRuleConditionsInput = {
  ruleName: string;
  condition: {
    aiInstructions?: string | null;
  };
};

export function isUpdateRuleConditionsInput(
  input: unknown,
): input is UpdateRuleConditionsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    ruleName?: unknown;
    condition?: unknown;
  };

  return (
    typeof value.ruleName === "string" &&
    typeof value.condition === "object" &&
    value.condition !== null
  );
}

export function hasActionType(
  actions: Array<{ type: ActionType }>,
  expectedActionType: ActionType,
) {
  return actions.some((action) => action.type === expectedActionType);
}

export function hasLabelAction(
  actions: UpdateRuleActionsInput["actions"],
  expectedLabel: string,
) {
  return actions.some(
    (action) =>
      action.type === ActionType.LABEL &&
      action.fields?.label === expectedLabel,
  );
}
