import type { ModelMessage } from "ai";
import type { getEmailAccount } from "@/__tests__/helpers";
import {
  captureAssistantChatTrace,
  type AssistantChatTrace,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import type { MessageContext } from "@/app/api/chat/validation";
import type { Logger } from "@/utils/logger";

export type AssistantChatEpisodeTurn = {
  userMessage: string;
  inboxStats?: { total: number; unread: number } | null;
  context?: MessageContext;
};

export type AssistantChatEpisode = {
  transcript: ModelMessage[];
  traces: AssistantChatTrace[];
  finalText: string;
};

export async function runAssistantEpisode({
  emailAccount,
  logger,
  turns,
  initialMessages = [],
  defaultInboxStats,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  logger: Logger;
  turns: AssistantChatEpisodeTurn[];
  initialMessages?: ModelMessage[];
  defaultInboxStats?: { total: number; unread: number } | null;
}): Promise<AssistantChatEpisode> {
  const transcript = [...initialMessages];
  const traces: AssistantChatTrace[] = [];

  for (const turn of turns) {
    transcript.push({
      role: "user",
      content: turn.userMessage,
    });

    const trace = await captureAssistantChatTrace({
      emailAccount,
      logger,
      messages: transcript,
      inboxStats: turn.inboxStats ?? defaultInboxStats,
      context: turn.context,
      chatHasHistory: transcript.length > 1,
    });
    const finalText = await Promise.resolve(trace.finalText);
    const normalizedTrace = {
      ...trace,
      finalText,
    };

    traces.push(normalizedTrace);
    transcript.push({
      role: "assistant",
      content: finalText,
    });
  }

  return {
    transcript,
    traces,
    finalText: traces.at(-1)?.finalText ?? "",
  };
}
