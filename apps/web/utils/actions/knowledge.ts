"use server";

import { revalidatePath } from "next/cache";
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
  .action(async ({ ctx: { email }, parsedInput: { title, content } }) => {
    await prisma.knowledge.create({
      data: {
        title,
        content,
        emailAccountId: email,
      },
    });

    revalidatePath("/automation");
  });

export const updateKnowledgeAction = actionClient
  .metadata({ name: "updateKnowledge" })
  .schema(updateKnowledgeBody)
  .action(async ({ ctx: { email }, parsedInput: { id, title, content } }) => {
    await prisma.knowledge.update({
      where: { id, emailAccountId: email },
      data: { title, content },
    });

    revalidatePath("/automation");
  });

export const deleteKnowledgeAction = actionClient
  .metadata({ name: "deleteKnowledge" })
  .schema(deleteKnowledgeBody)
  .action(async ({ ctx: { email }, parsedInput: { id } }) => {
    await prisma.knowledge.delete({
      where: { id, emailAccountId: email },
    });

    revalidatePath("/automation");
  });
