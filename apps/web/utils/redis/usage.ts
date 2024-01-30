import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

const usageSchema = z.object({
  openaiCalls: z.number().int().default(0),
  openaiTokensUsed: z.number().int().default(0),
  openaiCompletionTokensUsed: z.number().int().default(0),
  openaiPromptTokensUsed: z.number().int().default(0),
  cost: z.number().default(0),
});
type Usage = z.infer<typeof usageSchema>;

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
  cost: number;
}) {
  const { email, usage, cost } = options;

  const key = getUsageKey(email);

  Promise.all([
    redis.hincrby(key, "openaiCalls", 1),
    redis.hincrby(key, "openaiTokensUsed", usage.total_tokens),
    redis.hincrby(key, "openaiCompletionTokensUsed", usage.completion_tokens),
    redis.hincrby(key, "openaiPromptTokensUsed", usage.prompt_tokens),
    redis.hincrbyfloat(key, "cost", cost),
  ]);
}
