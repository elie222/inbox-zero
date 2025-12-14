import { redis } from "@/utils/redis";

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getPerplexityResearchKey(email: string) {
  return `perplexity-research:${email.toLowerCase()}`;
}

export async function getCachedPerplexityResearch(
  email: string,
): Promise<string | null> {
  return redis.get<string>(getPerplexityResearchKey(email));
}

export async function setCachedPerplexityResearch(
  email: string,
  content: string,
): Promise<void> {
  await redis.set(getPerplexityResearchKey(email), content, {
    ex: CACHE_TTL_SECONDS,
  });
}
