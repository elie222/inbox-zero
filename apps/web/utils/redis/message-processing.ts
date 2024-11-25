import { redis } from "@/utils/redis";

function getProcessingKey(userEmail: string, messageId: string) {
  return `processing-message:${userEmail}:${messageId}`;
}

export async function markMessageAsProcessing(options: {
  userEmail: string;
  messageId: string;
}): Promise<boolean> {
  const result = await redis.set(
    getProcessingKey(options.userEmail, options.messageId),
    "true",
    {
      ex: 60 * 5, // 5 minutes
      nx: true, // Only set if key doesn't exist
    },
  );

  // Redis returns "OK" if the key was set, and null if it was already set
  return result === "OK";
}
