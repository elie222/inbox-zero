import type { ModelMessage } from "ai";
import type { getEmailAccount } from "@/__tests__/helpers";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";

export type RecordedToolCall = {
  toolName: string;
  input: unknown;
};

export async function captureAssistantChatToolCalls({
  emailAccount,
  messages,
  logger,
  inboxStats,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
  logger: Logger;
  inboxStats?: { total: number; unread: number } | null;
}) {
  const recordedToolCalls: RecordedToolCall[] = [];

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId: emailAccount.id,
    user: emailAccount,
    inboxStats,
    logger,
    onStepFinish: async ({ toolCalls }) => {
      for (const toolCall of toolCalls || []) {
        recordedToolCalls.push({
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      }
    },
  });

  await result.consumeStream();

  return recordedToolCalls;
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
