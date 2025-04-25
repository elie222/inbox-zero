import { redis } from "@/utils/redis";

function getReplyKey({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}) {
  return `reply:${emailAccountId}:${messageId}`;
}

export async function getReply({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}): Promise<string | null> {
  return redis.get(getReplyKey({ emailAccountId, messageId }));
}

export async function saveReply({
  emailAccountId,
  messageId,
  reply,
}: {
  emailAccountId: string;
  messageId: string;
  reply: string;
}) {
  return redis.set(getReplyKey({ emailAccountId, messageId }), reply, {
    ex: 60 * 60 * 24, // 1 day
  });
}
