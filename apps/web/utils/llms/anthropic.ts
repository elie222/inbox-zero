import Anthropic from "@anthropic-ai/sdk";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { ChatCompletionTool } from "openai/resources/index";
import { env } from "@/env.mjs";

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-haiku-20240307";
// export const DEFAULT_ANTHROPIC_MODEL = "claude-3-opus-20240229";

const anthropics: Record<string, Anthropic> = {};

export function getAnthropic(apiKey: string | null) {
  const key = apiKey || env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No API key provided");
  if (anthropics[key]) return anthropics[key];
  anthropics[key] = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropics[key];
}

export async function anthropicChatCompletion(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  const anthropic = getAnthropic(apiKey);

  return anthropic.messages.create({
    model,
    temperature: 0,
    messages: fixMessages(messages),
    max_tokens: 2000, // TODO
  });
}

export async function anthropicChatCompletionStream(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  const anthropic = getAnthropic(apiKey);

  return anthropic.messages.create({
    model,
    temperature: 0,
    messages: fixMessages(messages),
    max_tokens: 2000, // TODO
    stream: true,
  });
}

export async function anthropicChatCompletionTools(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
  tools: Array<ChatCompletionTool>,
) {
  const anthropic = new ChatAnthropic({
    modelName: model,
    anthropicApiKey: apiKey || env.ANTHROPIC_API_KEY,
  });

  const anthropicTools = tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || "",
    input_schema: tool.function.parameters || {},
  }));

  anthropic.bind({ tools: anthropicTools });

  const response = await anthropic.invoke([
    new HumanMessage({
      content: messages.map((m) => m.content).join("\n\n"),
    }),
  ]);

  console.log(response);

  return response;
}

// roles must alternate between "user" and "assistant", but found multiple "user" roles in a row'
// if we find two "user" roles in a row, merge them into one with a new line between them
function fixMessages(
  messages: Array<{ role: "assistant" | "user"; content: string }>,
) {
  const fixed = [];
  for (const message of messages) {
    if (
      fixed.length > 0 &&
      fixed[fixed.length - 1].role === "user" &&
      message.role === "user"
    ) {
      fixed[fixed.length - 1].content += "\n" + message.content;
    } else {
      fixed.push(message);
    }
  }

  return fixed;
}
