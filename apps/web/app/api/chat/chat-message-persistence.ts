import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";

export function mapUiMessagesToChatMessageRows(
  messages: UIMessage[],
  chatId: string,
): Prisma.ChatMessageCreateManyInput[] {
  return messages.map((message) => ({
    id: message.id,
    chatId,
    role: message.role,
    parts: message.parts as Prisma.InputJsonValue,
  }));
}
