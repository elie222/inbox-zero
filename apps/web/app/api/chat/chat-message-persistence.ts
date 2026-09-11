import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { trimToNonEmptyString } from "@/utils/string";
import type { AssistantInput } from "@/utils/actions/assistant-chat.validation";

const CHAT_MESSAGE_METADATA_SCHEMA_VERSION = 1;

export type AssistantChatRunMetadata = {
  runId: string;
  provider: string | null;
  modelName: string | null;
  pipelineVersion: number;
  deploymentCommit: string | null;
  finishReason: string | null;
  stepCount: number;
  toolCallCount: number;
  visibleTextProduced: boolean;
};

export function mapUiMessagesToChatMessageRows(
  messages: UIMessage[],
  chatId: string,
  options?: { assistantRun?: AssistantChatRunMetadata },
): Prisma.ChatMessageCreateManyInput[] {
  return messages.map((message) => {
    const persistedMessageId = trimToNonEmptyString(message.id);
    const assistantRun = options?.assistantRun;

    return {
      ...(persistedMessageId ? { id: persistedMessageId } : {}),
      chatId,
      role: message.role,
      parts: message.parts as Prisma.InputJsonValue,
      ...(message.role === "assistant" && assistantRun
        ? { metadata: buildAssistantChatMessageMetadata(assistantRun) }
        : {}),
    };
  });
}

export function buildUserChatMessageMetadata({
  runId,
  context,
  inlineActions,
}: {
  runId: string;
  context?: AssistantInput["context"];
  inlineActions?: AssistantInput["inlineActions"];
}): Prisma.InputJsonObject {
  const hiddenContext = context
    ? {
        type: context.type,
        messageId: context.message.id,
        threadId: context.message.threadId,
        resultCount: context.results.length,
      }
    : null;
  const inlineActionMetadata = inlineActions?.length
    ? {
        types: [...new Set(inlineActions.map((action) => action.type))],
        actionCount: inlineActions.length,
        threadCount: inlineActions.reduce(
          (count, action) => count + action.threadIds.length,
          0,
        ),
      }
    : null;

  return {
    schemaVersion: CHAT_MESSAGE_METADATA_SCHEMA_VERSION,
    runId,
    ...(hiddenContext ? { hiddenContext } : {}),
    ...(inlineActionMetadata ? { inlineActions: inlineActionMetadata } : {}),
  };
}

function buildAssistantChatMessageMetadata(
  assistantRun: AssistantChatRunMetadata,
): Prisma.InputJsonObject {
  return {
    schemaVersion: CHAT_MESSAGE_METADATA_SCHEMA_VERSION,
    runId: assistantRun.runId,
    assistantRun: {
      provider: assistantRun.provider,
      modelName: assistantRun.modelName,
      pipelineVersion: assistantRun.pipelineVersion,
      deploymentCommit: assistantRun.deploymentCommit,
      finishReason: assistantRun.finishReason,
      stepCount: assistantRun.stepCount,
      toolCallCount: assistantRun.toolCallCount,
      visibleTextProduced: assistantRun.visibleTextProduced,
    },
  };
}
