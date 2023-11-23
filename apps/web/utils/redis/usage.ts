import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";
import { AIModel } from "@/utils/openai";

export const usageSchema = z.object({
  openaiCalls: z.number().int().default(0),
  openaiTokensUsed: z.number().int().default(0),
  openaiCompletionTokensUsed: z.number().int().default(0),
  openaiPromptTokensUsed: z.number().int().default(0),
  cost: z.number().default(0),
});
export type Usage = z.infer<typeof usageSchema>;

function getUsageKey(email: string) {
  return `usage:${email}`;
}

export async function getUsage(options: { email: string }) {
  const key = getUsageKey(options.email);
  const data = await redis.hgetall<Usage>(key);
  return data;
}

export async function saveUsage(options: {
  email: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: AIModel;
}) {
  const { email, usage, model } = options;

  const key = getUsageKey(email);
  const cost = calcuateCost(model, usage);
  console.log(`Cost: $${cost / 100}`);

  Promise.all([
    redis.hincrby(key, "openaiCalls", 1),
    redis.hincrby(key, "openaiTokensUsed", usage.total_tokens),
    redis.hincrby(key, "openaiCompletionTokensUsed", usage.completion_tokens),
    redis.hincrby(key, "openaiPromptTokensUsed", usage.prompt_tokens),
    redis.hincrbyfloat(key, "cost", cost),
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
    input: 0.0015 / 1000,
    output: 0.002 / 1000,
  },
  "gpt-4-1106-preview": {
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
