import { redis } from "@/utils/redis";
import type { CleanThread } from "@/utils/redis/clean.types";
import { isDefined } from "@/utils/types";

const EXPIRATION = 60 * 60 * 6; // 6 hours

const threadKey = (userId: string, threadId: string) =>
  `thread:${userId}:${threadId}`;

export async function saveThread(
  userId: string,
  {
    threadId,
    from,
    subject,
    snippet,
    date,
    archive,
    label,
  }: {
    threadId: string;
    from: string;
    subject: string;
    snippet: string;
    date: Date;
    archive?: boolean;
    label?: string;
  },
): Promise<CleanThread> {
  const thread: CleanThread = {
    threadId,
    userId,
    status: "processing",
    createdAt: new Date().toISOString(),
    from,
    subject,
    snippet,
    date,
    archive,
    label,
  };

  await publishThread(userId, thread);
  return thread;
}

export async function updateThread(
  userId: string,
  threadId: string,
  update: Partial<CleanThread>,
) {
  const thread = await getThread(userId, threadId);
  if (!thread) return;

  const updatedThread = { ...thread, ...update };
  await publishThread(userId, updatedThread);
}

export async function publishThread(userId: string, thread: CleanThread) {
  const key = threadKey(userId, thread.threadId);
  // Store the data with expiration
  await redis.set(key, thread, { ex: EXPIRATION });
  // Publish the update to any listening clients
  await redis.publish(key, JSON.stringify(thread));
}

export async function getThread(userId: string, threadId: string) {
  const key = threadKey(userId, threadId);
  return redis.get<CleanThread>(key);
}

export async function getThreads(userId: string, limit = 1000) {
  const pattern = `thread:${userId}:*`;
  const keys = [];
  let cursor = 0;

  // Scan through keys until we hit our limit or run out of keys
  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: pattern,
      count: 100, // How many keys to fetch per iteration
    });
    cursor = Number(nextCursor);
    keys.push(...batch);

    if (keys.length >= limit) break;
  } while (cursor !== 0);

  // Slice to ensure we don't exceed limit
  const keysToFetch = keys.slice(0, limit);
  if (keysToFetch.length === 0) return [];

  const threads = await Promise.all(
    keysToFetch.map((key) => redis.get<CleanThread>(key)),
  );
  return threads.filter(isDefined);
}
