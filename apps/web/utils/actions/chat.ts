"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  deleteChatBody,
  renameChatBody,
} from "@/utils/actions/chat.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { softDeleteChat } from "@/utils/chat/soft-delete";

export const deleteChatAction = actionClient
  .metadata({ name: "deleteChat" })
  .inputSchema(deleteChatBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { chatId } }) => {
    const deleted = await softDeleteChat({ chatId, emailAccountId });
    if (!deleted) throw new SafeError("Chat not found.");
  });

export const renameChatAction = actionClient
  .metadata({ name: "renameChat" })
  .inputSchema(renameChatBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { chatId, name } }) => {
      const result = await prisma.chat.updateMany({
        where: { id: chatId, emailAccountId, deletedAt: null },
        data: { name },
      });

      if (result.count === 0) throw new SafeError("Chat not found.");
    },
  );
