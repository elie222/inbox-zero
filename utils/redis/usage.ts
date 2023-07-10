import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

export const usageSchema = z.object({
  openaiCalls: z.number().default(0),
  openaiTokensUsed: z.number().default(0),
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
  tokensUsed: Usage["openaiTokensUsed"];
}) {
  const key = getUsageKey(options.email);
  await redis.hincrby(key, "openaiCalls", 1);
  await redis.hincrby(key, "openaiTokensUsed", options.tokensUsed);
}
