import { createHash } from "node:crypto";
import { redis } from "@/utils/redis";

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getPerplexityResearchKey(
  userId: string,
  email: string,
  name: string | undefined,
) {
  const input = `${email.toLowerCase()}:${name ?? ""}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `perplexity-research:${userId}:${hash}`;
}

export async function getCachedPerplexityResearch(
  userId: string,
  email: string,
  name: string | undefined,
): Promise<string | null> {
  return redis.get<string>(getPerplexityResearchKey(userId, email, name));
}

export async function setCachedPerplexityResearch(
  userId: string,
  email: string,
  name: string | undefined,
  content: string,
): Promise<void> {
  await redis.set(getPerplexityResearchKey(userId, email, name), content, {
    ex: CACHE_TTL_SECONDS,
  });
}
