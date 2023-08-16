import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

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
  model: "gpt-3.5-turbo" | "gpt-4";
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

// returns cost in cents
function calcuateCost(
  model: "gpt-3.5-turbo" | "gpt-4",
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  }
): number {
  let costPerCompletionToken: number;
  let costPerPromptToken: number;

  if (model === "gpt-4") {
    costPerCompletionToken = 0.003;
    costPerPromptToken = 0.006;
  } else {
    costPerCompletionToken = 0.00015;
    costPerPromptToken = 0.0002;
  }

  return (
    usage.completion_tokens * costPerCompletionToken +
    usage.prompt_tokens * costPerPromptToken
  );
}
