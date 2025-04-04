"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  createKnowledgeBody,
  type CreateKnowledgeBody,
  updateKnowledgeBody,
  type UpdateKnowledgeBody,
  deleteKnowledgeBody,
  type DeleteKnowledgeBody,
} from "@/utils/actions/knowledge.validation";

export const createKnowledgeAction = withActionInstrumentation(
  "createKnowledge",
  async (unsafeData: CreateKnowledgeBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = createKnowledgeBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await prisma.knowledge.create({
      data: {
        ...data,
        userId,
      },
    });

    revalidatePath("/automation");
  },
);

export const updateKnowledgeAction = withActionInstrumentation(
  "updateKnowledge",
  async (unsafeData: UpdateKnowledgeBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = updateKnowledgeBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await prisma.knowledge.update({
      where: { id: data.id, userId },
      data: {
        title: data.title,
        content: data.content,
      },
    });

    revalidatePath("/automation");
  },
);

export const deleteKnowledgeAction = withActionInstrumentation(
  "deleteKnowledge",
  async (unsafeData: DeleteKnowledgeBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = deleteKnowledgeBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await prisma.knowledge.delete({
      where: { id: data.id, userId },
    });

    revalidatePath("/automation");
  },
);
