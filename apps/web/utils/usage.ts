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
