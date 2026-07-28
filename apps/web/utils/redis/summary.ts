import { createHash } from "node:crypto";
import { redis } from "@/utils/redis";

// A week is plenty for a summary cache, and hashing keeps the raw email
// text out of the Redis keyspace (it would otherwise appear in SCAN/MONITOR
// output and never expire).
const SUMMARY_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSummaryKey(text: string) {
  return `summary:${createHash("sha256").update(text).digest("hex")}`;
}

export async function getSummary(text: string): Promise<string | null> {
  return redis.get(getSummaryKey(text));
}

export async function saveSummary(text: string, summary: string) {
  return redis.set(getSummaryKey(text), summary, { ex: SUMMARY_TTL_SECONDS });
}
