import { redis } from "@/utils/redis";

function getReplyKey({
  userId,
  messageId,
}: {
  userId: string;
  messageId: string;
}) {
  return `reply:${userId}:${messageId}`;
}

export async function getReply({
  userId,
  messageId,
}: {
  userId: string;
  messageId: string;
}): Promise<string | null> {
  return redis.get(getReplyKey({ userId, messageId }));
}

export async function saveReply({
  userId,
  messageId,
  reply,
}: {
  userId: string;
  messageId: string;
  reply: string;
}) {
  return redis.set(getReplyKey({ userId, messageId }), reply, {
    ex: 60 * 60 * 24, // 1 day
  });
}
