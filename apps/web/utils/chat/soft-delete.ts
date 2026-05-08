import prisma from "@/utils/prisma";

export const REDACTED_TEXT = "[REDACTED]";

const REDACTED_PARTS = [{ type: "text", text: REDACTED_TEXT }];

/**
 * Soft-deletes a chat owned by `emailAccountId`.
 *
 * The Chat row itself is preserved (with `deletedAt` set) so platform-level
 * analytics and audit trails still work, but every piece of user-supplied or
 * model-generated content tied to the chat is replaced with a redacted
 * placeholder. This includes:
 *  - `Chat.name`
 *  - `ChatMessage.parts` for every message in the chat
 *  - `ChatCompaction.summary` for every compaction in the chat
 *  - `ChatMemory.content` for memories linked to this chat
 *
 * Returns `true` if the chat existed and is now soft-deleted (or was already
 * soft-deleted), `false` if no chat with the given id was owned by this
 * account.
 */
export async function softDeleteChat({
  chatId,
  emailAccountId,
}: {
  chatId: string;
  emailAccountId: string;
}): Promise<boolean> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, emailAccountId },
    select: { id: true, deletedAt: true },
  });

  if (!chat) return false;
  if (chat.deletedAt) return true;

  // Run as a single transaction so a failed redaction can't leave a chat
  // marked as deleted while messages, compactions, or memories are still
  // readable.
  await prisma.$transaction([
    prisma.chat.update({
      where: { id: chat.id },
      data: { deletedAt: new Date(), name: null },
    }),
    prisma.chatMessage.updateMany({
      where: { chatId: chat.id },
      data: { parts: REDACTED_PARTS },
    }),
    prisma.chatCompaction.updateMany({
      where: { chatId: chat.id },
      data: { summary: REDACTED_TEXT },
    }),
    prisma.chatMemory.updateMany({
      where: { chatId: chat.id },
      data: { content: REDACTED_TEXT },
    }),
  ]);

  return true;
}
