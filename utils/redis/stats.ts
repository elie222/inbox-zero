import "server-only";
import { redis } from "@/utils/redis";

export type RedisStats = Record<string, number>; // { [day] : count }

function getStatsKey(email: string) {
  return `stats:${email}`;
}

export async function getAllStats(options: { email: string }) {
  const key = getStatsKey(options.email);
  return redis.hgetall<RedisStats>(key);
}

export async function getDayStat(options: { email: string; day: string }) {
  const key = getStatsKey(options.email);
  return redis.hget<number>(key, options.day);
}

export async function saveDayStat(options: {
  email: string;
  day: string;
  count: number;
}) {
  return redis.hmset(getStatsKey(options.email), {
    [options.day]: options.count,
  });
}

export async function saveUserStats(options: {
  email: string;
  stats: RedisStats;
}) {
  const key = getStatsKey(options.email);
  return redis.set(key, options.stats);
}

export async function deleteUserStats(options: { email: string }) {
  const key = getStatsKey(options.email);
  return redis.del(key);
}
