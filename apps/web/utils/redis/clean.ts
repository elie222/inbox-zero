import { redis } from "@/utils/redis";
import type { CleanThread } from "@/utils/redis/clean.types";
import { isDefined } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("redis/clean");

const EXPIRATION = 60 * 60 * 6; // 6 hours

const threadKey = ({
  emailAccountId,
  jobId,
  threadId,
}: {
  emailAccountId: string;
  jobId: string;
  threadId: string;
}) => `thread:${emailAccountId}:${jobId}:${threadId}`;

export async function saveThread({
  emailAccountId,
  thread,
}: {
  emailAccountId: string;
  thread: {
    threadId: string;
    jobId: string;
    from: string;
    subject: string;
    snippet: string;
    date: Date;
    archive?: boolean;
    label?: string;
  };
}): Promise<CleanThread> {
  const cleanThread: CleanThread = {
    ...thread,
    emailAccountId,
    status: "processing",
    createdAt: new Date().toISOString(),
  };

  await publishThread({ emailAccountId, thread: cleanThread });
  return cleanThread;
}

export async function updateThread({
  emailAccountId,
  jobId,
  threadId,
  update,
}: {
  emailAccountId: string;
  jobId: string;
  threadId: string;
  update: Partial<CleanThread>;
}) {
  const thread = await getThread({ emailAccountId, jobId, threadId });
  if (!thread) {
    logger.warn("Thread not found", { threadId, emailAccountId, jobId });
    return;
  }

  const updatedThread = { ...thread, ...update };
  await publishThread({ emailAccountId, thread: updatedThread });
}

export async function publishThread({
  emailAccountId,
  thread,
}: {
  emailAccountId: string;
  thread: CleanThread;
}) {
  const key = threadKey({
    emailAccountId,
    jobId: thread.jobId,
    threadId: thread.threadId,
  });

  // Store the data with expiration
  await redis.set(key, thread, { ex: EXPIRATION });
  // Publish the update to any listening clients
  await redis.publish(key, JSON.stringify(thread));
}

async function getThread({
  emailAccountId,
  jobId,
  threadId,
}: {
  emailAccountId: string;
  jobId: string;
  threadId: string;
}) {
  const key = threadKey({ emailAccountId, jobId, threadId });
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
