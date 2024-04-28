import {
  DEFAULT_ANTHROPIC_MODEL,
  anthropicChatCompletion,
  anthropicChatCompletionStream,
  anthropicChatCompletionTools,
} from "@/utils/llms/anthropic";
import {
  DEFAULT_OPENAI_MODEL,
  openAIChatCompletion,
  openAIChatCompletionStream,
} from "@/utils/llms/openai";
import { ChatCompletionTool } from "openai/resources/index";

const DEFAULT_AI_PROVIDER = "openai";

export function getAiProviderAndModel(
  provider: string | null,
  model: string | null,
): {
  provider: string;
  model: string;
} {
  if (provider === "anthropic") {
    return {
      provider,
      model: model || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  return {
    provider: provider || DEFAULT_AI_PROVIDER,
    model: model || DEFAULT_OPENAI_MODEL,
  };
}

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

export async function chatCompletionTools(
  provider: string | null,
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
  tools: Array<ChatCompletionTool>,
): Promise<{
  functionCall?: {
    name: string;
    arguments: string;
  };
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  } | null;
}> {
  if (provider === "openai") {
    const completion = await openAIChatCompletion(model, apiKey, messages, {
      tools,
    });

    return {
      functionCall: completion.choices?.[0]?.message.tool_calls?.[0]?.function,
      usage: completion.usage || null,
    };
  }

  if (provider === "anthropic") {
    const completion = await anthropicChatCompletionTools(
      model,
      apiKey,
      messages.map((m) => ({ role: "user", content: m.content })),
      tools,
    );
    const completion_tokens =
      (completion.additional_kwargs.usage as any).output_tokens || 0;
    const prompt_tokens =
      (completion.additional_kwargs as any).usage.input_tokens || 0;
    return {
      functionCall: completion.additional_kwargs.tool_calls?.[0]?.function,
      usage: {
        completion_tokens,
        prompt_tokens,
        total_tokens: completion_tokens + prompt_tokens,
      },
    };
  }

  throw new Error("AI provider not supported");
}
