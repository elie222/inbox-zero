import { redis } from "@/utils/redis";

function getReplyKey({
  email,
  messageId,
}: {
  email: string;
  messageId: string;
}) {
  return `reply:${email}:${messageId}`;
}

export async function getReply({
  email,
  messageId,
}: {
  email: string;
  messageId: string;
}): Promise<string | null> {
  return redis.get(getReplyKey({ email, messageId }));
}

export async function saveReply({
  email,
  messageId,
  reply,
}: {
  email: string;
  messageId: string;
  reply: string;
}) {
  return redis.set(getReplyKey({ email, messageId }), reply, {
    ex: 60 * 60 * 24, // 1 day
  });
}
