import { redis } from "@/utils/redis";

export type Thread = {
  threadId: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
};

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
  }: {
    threadId: string;
    from: string;
    subject: string;
    snippet: string;
    date: Date;
  },
): Promise<Thread> {
  const thread: Thread = {
    threadId,
    userId,
    status: "pending",
    createdAt: new Date().toISOString(),
    from,
    subject,
    snippet,
    date,
  };

  await publishThread(userId, thread);
  return thread;
}

export async function updateThreadStatus(
  userId: string,
  threadId: string,
  status: Thread["status"],
) {
  const thread = await getThread(userId, threadId);
  if (!thread) return;

  const updatedThread = { ...thread, status };
  await publishThread(userId, updatedThread);
}

export async function publishThread(userId: string, thread: Thread) {
  const key = threadKey(userId, thread.threadId);
  // Store the data with expiration
  await redis.set(key, thread, { ex: EXPIRATION });
  // Publish the update to any listening clients
  await redis.publish(key, JSON.stringify(thread));
}

export async function getThread(userId: string, threadId: string) {
  const key = threadKey(userId, threadId);
  return redis.get<Thread>(key);
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
    keysToFetch.map((key) => redis.get<Thread>(key)),
  );
  return threads.filter((t): t is Thread => t !== null);
}
