import { anthropicChatCompletion } from "@/utils/llms/anthropic";
import { openAIChatCompletion } from "@/utils/llms/openai";

export const DEFAULT_AI_PROVIDER = "openai";
export const DEFAULT_AI_MODEL = "gpt-4-turbo-preview";

export async function chatCompletion(
  provider: "openai" | "anthropic" | null,
  model: string,
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
): Promise<{
  response: string | null;
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  } | null;
}> {
  if (provider === "openai") {
    const completion = await openAIChatCompletion(model, messages);
    return {
      response: completion.choices[0].message.content,
      usage: completion.usage || null,
    };
  }

  if (provider === "anthropic") {
    const completion = await anthropicChatCompletion(
      model,
      messages.map((m) => ({ role: "user", content: m.content })),
    );
    return {
      response: completion.content[0].text,
      usage: {
        completion_tokens: completion.usage.output_tokens,
        prompt_tokens: completion.usage.input_tokens,
        total_tokens:
          completion.usage.input_tokens + completion.usage.output_tokens,
      },
    };
  }

  throw new Error("AI provider not supported");
}
