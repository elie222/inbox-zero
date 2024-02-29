import { redis } from "@/utils/redis";

export async function getSummary(text: string): Promise<string | null> {
  return redis.get(text);
}

export async function saveSummary(text: string, summary: string) {
  return redis.set(text, summary);
}
