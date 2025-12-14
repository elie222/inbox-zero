import { createHash } from "node:crypto";
import { redis } from "@/utils/redis";

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getPerplexityResearchKey(email: string, name: string | undefined) {
  const input = `${email.toLowerCase()}:${name ?? ""}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `perplexity-research:${hash}`;
}

export async function getCachedPerplexityResearch(
  email: string,
  name: string | undefined,
): Promise<string | null> {
  return redis.get<string>(getPerplexityResearchKey(email, name));
}

export async function setCachedPerplexityResearch(
  email: string,
  name: string | undefined,
  content: string,
): Promise<void> {
  await redis.set(getPerplexityResearchKey(email, name), content, {
    ex: CACHE_TTL_SECONDS,
  });
}
