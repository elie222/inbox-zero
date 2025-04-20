import { redis } from "@/utils/redis";
import type { CleanThread } from "@/utils/redis/clean.types";
import { isDefined } from "@/utils/types";

const EXPIRATION = 60 * 60 * 6; // 6 hours

const threadKey = (email: string, jobId: string, threadId: string) =>
  `thread:${email}:${jobId}:${threadId}`;

export async function saveThread(
  email: string,
  thread: {
    threadId: string;
    jobId: string;
    from: string;
    subject: string;
    snippet: string;
    date: Date;
    archive?: boolean;
    label?: string;
  },
): Promise<CleanThread> {
  const cleanThread: CleanThread = {
    ...thread,
    email,
    status: "processing",
    createdAt: new Date().toISOString(),
  };

  await publishThread({ email, thread: cleanThread });
  return cleanThread;
}

export async function updateThread({
  email,
  jobId,
  threadId,
  update,
}: {
  email: string;
  jobId: string;
  threadId: string;
  update: Partial<CleanThread>;
}) {
  const thread = await getThread(email, jobId, threadId);
  if (!thread) {
    console.warn("thread not found:", threadId);
    return;
  }

  const updatedThread = { ...thread, ...update };
  await publishThread({ email, thread: updatedThread });
}

export async function publishThread({
  email,
  thread,
}: {
  email: string;
  thread: CleanThread;
}) {
  const key = threadKey(email, thread.jobId, thread.threadId);

  // Store the data with expiration
  await redis.set(key, thread, { ex: EXPIRATION });
  // Publish the update to any listening clients
  await redis.publish(key, JSON.stringify(thread));
}

async function getThread(email: string, jobId: string, threadId: string) {
  const key = threadKey(email, jobId, threadId);
  return redis.get<CleanThread>(key);
}

export async function getThreadsByJobId({
  emailAccountId,
  jobId,
  limit = 1000,
}: {
  emailAccountId: string;
  jobId: string;
  limit?: number;
}) {
  const pattern = `thread:${emailAccountId}:${jobId}:*`;
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

export async function deleteAllUserData(userId: string) {
  // Delete all thread keys for this user
  const threadPattern = `thread:${userId}:*`;
  let cursor = 0;
  let deletedThreads = 0;

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: threadPattern,
      count: 100,
    });
    cursor = Number(nextCursor);

    if (batch.length > 0) {
      // Spread the array of keys
      await redis.unlink(...batch);
      deletedThreads += batch.length;
    }
  } while (cursor !== 0);

  return { deletedThreads };
}
