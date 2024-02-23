import { OpenAIStream } from "ai";
import { encoding_for_model } from "tiktoken";
import { ChatCompletionChunk } from "openai/resources";
import { Stream } from "openai/streaming";
import { AIModel } from "@/utils/openai";
import { saveUsage } from "@/utils/redis/usage";
import { publishAiCall } from "@inboxzero/tinybird-ai-analytics";

export async function saveAiUsage({
  email,
  model,
  usage,
  label,
}: {
  email: string;
  model: AIModel;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  label: string;
}) {
  const cost = calcuateCost(model, usage);

  return Promise.all([
    publishAiCall({
      userId: email,
      provider: "openai",
      totalTokens: usage.total_tokens,
      completionTokens: usage.completion_tokens,
      promptTokens: usage.prompt_tokens,
      cost,
      model,
      timestamp: Date.now(),
      label,
    }),
    saveUsage({ email, cost, usage }),
  ]);
}

export async function saveAiUsageStream({
  response,
  model,
  userEmail,
  messages,
  label,
}: {
  response: Stream<ChatCompletionChunk>;
  model: AIModel;
  userEmail: string;
  messages: { role: "system" | "user"; content: string }[];
  label: string;
}) {
  const enc = encoding_for_model(model);
  let completionTokens = 0;

  // to count token usage:
  // https://www.linkedin.com/pulse/token-usage-openai-streams-peter-marton-7bgpc/
  const stream = OpenAIStream(response, {
    onToken: (content) => {
      // We call encode for every message as some experienced
      // regression when tiktoken called with the full completion
      const tokenList = enc.encode(content);
      completionTokens += tokenList.length;
    },
    async onFinal() {
      const promptTokens = messages.reduce(
        (total, msg) => total + enc.encode(msg.content ?? "").length,
        0,
      );

      await saveAiUsage({
        email: userEmail,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        model,
        label,
      });
    },
  });

  return stream;
}

// https://openai.com/pricing
const costs: Record<
  AIModel,
  {
    input: number;
    output: number;
  }
> = {
  "gpt-3.5-turbo-1106": {
    input: 0.001 / 1000,
    output: 0.002 / 1000,
  },
  "gpt-4-turbo-preview": {
    input: 0.01 / 1000,
    output: 0.03 / 1000,
  },
};

// returns cost in cents
function calcuateCost(
  model: AIModel,
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  },
): number {
  const { input, output } = costs[model];

  return usage.prompt_tokens * input + usage.completion_tokens * output;
}
