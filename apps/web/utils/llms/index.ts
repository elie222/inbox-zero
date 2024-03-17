import {
  anthropicChatCompletion,
  anthropicChatCompletionStream,
} from "@/utils/llms/anthropic";
import {
  openAIChatCompletion,
  openAIChatCompletionStream,
} from "@/utils/llms/openai";

export const DEFAULT_AI_PROVIDER = "openai";
export const DEFAULT_AI_MODEL = "gpt-4-turbo-preview";

export async function chatCompletion(
  provider: string | null,
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
  options: { jsonResponse?: boolean },
): Promise<{
  response: any;
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  } | null;
}> {
  if (provider === "openai") {
    const completion = await openAIChatCompletion(
      model,
      apiKey,
      messages,
      options,
    );
    return {
      response: completion.choices[0].message.content,
      usage: completion.usage || null,
    };
  }

  if (provider === "anthropic") {
    const completion = await anthropicChatCompletion(
      model,
      apiKey,
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

export async function chatCompletionStream(
  provider: string | null,
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
) {
  if (provider === "openai") {
    const completion = await openAIChatCompletionStream(
      model,
      apiKey,
      messages,
    );
    return completion;
  }

  if (provider === "anthropic") {
    const completion = await anthropicChatCompletionStream(
      model,
      apiKey,
      messages.map((m) => ({ role: "user", content: m.content })),
    );
    return completion;
  }

  throw new Error("AI provider not supported");
}
export type ChatCompletionStreamResponse = Awaited<
  ReturnType<typeof chatCompletionStream>
>;
