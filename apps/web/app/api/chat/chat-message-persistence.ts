import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { trimToNonEmptyString } from "@/utils/string";

export function mapUiMessagesToChatMessageRows(
  messages: UIMessage[],
  chatId: string,
): Prisma.ChatMessageCreateManyInput[] {
  return messages.map((message) => {
    const persistedMessageId = trimToNonEmptyString(message.id);

    return {
      ...(persistedMessageId ? { id: persistedMessageId } : {}),
      chatId,
      role: message.role,
      parts: message.parts as Prisma.InputJsonValue,
    };
  });
}
