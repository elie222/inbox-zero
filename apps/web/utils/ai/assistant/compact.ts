import type { ModelMessage } from "ai";
import { z } from "zod";
import { Provider } from "@/utils/llms/config";
import { getModel } from "@/utils/llms/model";
import { createGenerateText, createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";

export const RECENT_MESSAGES_TO_KEEP = 6;

const COMPACTION_THRESHOLDS: Record<string, number> = {
  [Provider.OPENROUTER]: 200_000,
  [Provider.GOOGLE]: 200_000,
  [Provider.AI_GATEWAY]: 200_000,
  [Provider.ANTHROPIC]: 150_000,
  [Provider.BEDROCK]: 150_000,
  [Provider.OPEN_AI]: 96_000,
  [Provider.GROQ]: 60_000,
};

const DEFAULT_COMPACTION_THRESHOLD = 80_000;

export function estimateTokens(messages: ModelMessage[]): number {
  let totalChars = 0;

  for (const message of messages) {
    if (typeof message.content === "string") {
      totalChars += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if ("text" in part && typeof part.text === "string") {
          totalChars += part.text.length;
        }
        if ("input" in part && part.input) {
          totalChars += JSON.stringify(part.input).length;
        }
        if ("result" in part && part.result) {
          totalChars += JSON.stringify(part.result).length;
        }
      }
    }
  }

  return Math.ceil(totalChars / 4);
}

export function shouldCompact(
  messages: ModelMessage[],
  provider: string,
): boolean {
  const threshold =
    COMPACTION_THRESHOLDS[provider] ?? DEFAULT_COMPACTION_THRESHOLD;
  return estimateTokens(messages) > threshold;
}

export async function compactMessages({
  messages,
  user,
  logger,
}: {
  messages: ModelMessage[];
  user: EmailAccountWithAI;
  logger: Logger;
}): Promise<{
  compactedMessages: ModelMessage[];
  summary: string;
  compactedCount: number;
}> {
  const systemMessages: ModelMessage[] = [];
  const conversationMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemMessages.push(message);
    } else {
      conversationMessages.push(message);
    }
  }

  if (conversationMessages.length <= RECENT_MESSAGES_TO_KEEP) {
    return {
      compactedMessages: messages,
      summary: "",
      compactedCount: 0,
    };
  }

  const messagesToCompact = conversationMessages.slice(
    0,
    -RECENT_MESSAGES_TO_KEEP,
  );
  const recentMessages = conversationMessages.slice(-RECENT_MESSAGES_TO_KEEP);

  const serialized = serializeMessages(messagesToCompact);

  const modelOptions = getModel(user.user, "economy");
  const generateText = createGenerateText({
    emailAccount: user,
    label: "chat-compaction",
    modelOptions,
  });

  const result = await generateText({
    ...modelOptions,
    prompt: `Summarize the following conversation between a user and an AI email assistant.

Preserve:
- All specific actions taken (rules created/modified, emails archived, labels applied) with exact names and IDs
- Tool call results and data retrieved (sender names, email counts, rule names)
- User preferences and instructions expressed
- Ongoing tasks or commitments
- The current topic/intent if the conversation has one

Be concise but thorough. Do not omit any actions or decisions.

<conversation>
${serialized}
</conversation>`,
  });

  logger.info("Chat compaction completed", {
    compactedCount: messagesToCompact.length,
    summaryLength: result.text.length,
  });

  const summaryMessage: ModelMessage = {
    role: "system",
    content: `Summary of earlier conversation:\n${result.text}`,
  };

  return {
    compactedMessages: [...systemMessages, summaryMessage, ...recentMessages],
    summary: result.text,
    compactedCount: messagesToCompact.length,
  };
}

const memoriesSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string(),
    }),
  ),
});

export async function extractMemories({
  messages,
  user,
}: {
  messages: ModelMessage[];
  user: EmailAccountWithAI;
}): Promise<z.infer<typeof memoriesSchema>["memories"]> {
  const conversationMessages = messages.filter((m) => m.role !== "system");
  if (conversationMessages.length === 0) return [];

  const serialized = serializeMessages(conversationMessages);

  const modelOptions = getModel(user.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount: user,
    label: "chat-memory-extraction",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    schema: memoriesSchema,
    prompt: `Review this conversation between a user and their email assistant. Extract durable insights that should be remembered across future conversations.

Focus on:
- User preferences about how they want their inbox managed
- Workflow patterns (e.g., "archive all newsletters", "always reply to boss quickly")
- Rules or configurations set up and their rationale
- Information about the user's role, company, or work style
- Important contacts or senders mentioned

Return each memory as a separate item. If there are no new durable insights, return an empty array.
Respond in JSON format.

<conversation>
${serialized}
</conversation>`,
  });

  return result.object.memories;
}

function serializeMessages(messages: ModelMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role.toUpperCase();
      const content = serializeContent(message.content);
      return `[${role}]: ${content}`;
    })
    .join("\n\n");
}

function serializeContent(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;

  if (!Array.isArray(content)) return String(content);

  const parts: string[] = [];

  for (const part of content) {
    if ("text" in part && typeof part.text === "string") {
      parts.push(part.text);
    }
    if ("toolName" in part && typeof part.toolName === "string") {
      const input = "input" in part ? JSON.stringify(part.input) : "";
      parts.push(`[Tool call: ${part.toolName}(${input})]`);
    }
    if ("result" in part && part.result !== undefined) {
      const resultStr =
        typeof part.result === "string"
          ? part.result
          : JSON.stringify(part.result);
      parts.push(`[Tool result: ${resultStr}]`);
    }
  }

  return parts.join("\n");
}
