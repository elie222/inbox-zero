import { redis } from "@/utils/redis";
import type { CleanThread, CleanStats } from "@/utils/redis/clean.types";
import { isDefined } from "@/utils/types";

const EXPIRATION = 60 * 60 * 6; // 6 hours

const threadKey = (userId: string, threadId: string) =>
  `thread:${userId}:${threadId}`;
const statsKey = (userId: string) => `clean-stats:${userId}`;

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
  // Update stats first before saving new state
  await updateStats(userId, thread);
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

async function updateStats(userId: string, thread: CleanThread) {
  const key = statsKey(userId);
  const currentStats = await getStats(userId);
  const oldThread = await getThread(userId, thread.threadId);

  // Initialize stats if they don't exist
  const stats: CleanStats = currentStats || {
    total: 0,
    processing: 0,
    applying: 0,
    completed: 0,
    archived: 0,
    labels: {},
  };

  // If this is a new thread
  if (!oldThread) {
    stats.total++;
    // Add new status count
    if (thread.status === "processing") stats.processing++;
    if (thread.status === "applying") stats.applying++;
    if (thread.status === "completed") stats.completed++;
    if (thread.archive) stats.archived++;
    if (thread.label) {
      stats.labels[thread.label] = (stats.labels[thread.label] || 0) + 1;
    }
  } else {
    // Handle status changes
    if (oldThread.status !== thread.status) {
      // Decrement old status
      if (oldThread.status === "processing") stats.processing--;
      if (oldThread.status === "applying") stats.applying--;
      if (oldThread.status === "completed") stats.completed--;

      // Increment new status
      if (thread.status === "processing") stats.processing++;
      if (thread.status === "applying") stats.applying++;
      if (thread.status === "completed") stats.completed++;
    }

    // Handle archive changes
    if (oldThread.archive !== thread.archive) {
      if (thread.archive) stats.archived++;
      else stats.archived--;
    }

    // Handle label changes
    if (oldThread.label !== thread.label) {
      if (oldThread.label) {
        stats.labels[oldThread.label]--;
        if (stats.labels[oldThread.label] === 0) {
          delete stats.labels[oldThread.label];
        }
      }
      if (thread.label) {
        stats.labels[thread.label] = (stats.labels[thread.label] || 0) + 1;
      }
    }
  }

  await redis.set(key, stats, { ex: EXPIRATION });
  await redis.publish(`${key}:updates`, JSON.stringify(stats));
}

export async function getStats(userId: string): Promise<CleanStats | null> {
  const key = statsKey(userId);
  return redis.get<CleanStats>(key);
}

export async function resetStats(userId: string) {
  const key = statsKey(userId);
  const initialStats: CleanStats = {
    total: 0,
    processing: 0,
    applying: 0,
    completed: 0,
    archived: 0,
    labels: {},
  };
  await redis.set(key, initialStats, { ex: EXPIRATION });
  return initialStats;
}
