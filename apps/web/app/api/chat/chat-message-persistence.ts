import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";

export function mapUiMessagesToChatMessageRows(
  messages: UIMessage[],
  chatId: string,
): Prisma.ChatMessageCreateManyInput[] {
  return messages.map((message) => {
    const persistedMessageId = getPersistedMessageId(message.id);

    return {
      ...(persistedMessageId ? { id: persistedMessageId } : {}),
      chatId,
      role: message.role,
      parts: message.parts as Prisma.InputJsonValue,
    };
  });
}

function getPersistedMessageId(messageId: string | undefined) {
  if (typeof messageId !== "string") return undefined;

  const trimmedMessageId = messageId.trim();
  return trimmedMessageId.length > 0 ? trimmedMessageId : undefined;
}
