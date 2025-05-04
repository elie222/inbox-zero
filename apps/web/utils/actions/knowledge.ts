"use server";

import prisma from "@/utils/prisma";
import {
  createKnowledgeBody,
  updateKnowledgeBody,
  deleteKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import { actionClient } from "@/utils/actions/safe-action";

export const createKnowledgeAction = actionClient
  .metadata({ name: "createKnowledge" })
  .schema(createKnowledgeBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { title, content } }) => {
      await prisma.knowledge.create({
        data: {
          title,
          content,
          emailAccountId,
        },
      });
    },
  );

export const updateKnowledgeAction = actionClient
  .metadata({ name: "updateKnowledge" })
  .schema(updateKnowledgeBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { id, title, content },
    }) => {
      await prisma.knowledge.update({
        where: { id, emailAccountId },
        data: { title, content },
      });
    },
  );

export const deleteKnowledgeAction = actionClient
  .metadata({ name: "deleteKnowledge" })
  .schema(deleteKnowledgeBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.knowledge.delete({
      where: { id, emailAccountId },
    });
  });
