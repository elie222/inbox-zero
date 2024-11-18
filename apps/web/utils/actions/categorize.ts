"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateCategoryBody,
  createCategoryBody,
} from "@/utils/actions/validation";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { defaultCategory } from "@/utils/categories";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { triggerCategorizeBatch } from "@/utils/categorize/senders/trigger-batch";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { isActionError } from "@/utils/error";

export const bulkCategorizeSendersAction = withActionInstrumentation(
  "bulkCategorizeSenders",
  async () => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { user } = sessionResult;

    const userResult = await validateUserAndAiAccess(user.id);
    if (isActionError(userResult)) return userResult;

    await triggerCategorizeBatch({ userId: user.id, pageIndex: 0 });

    revalidatePath("/smart-categories");
  },
);

export const categorizeSenderAction = withActionInstrumentation(
  "categorizeSender",
  async (senderAddress: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user: u } = sessionResult;

    const userResult = await validateUserAndAiAccess(u.id);
    if (isActionError(userResult)) return userResult;
    const { user } = userResult;

    const result = await categorizeSender(senderAddress, user, gmail);

    revalidatePath("/smart-categories");

    return result;
  },
);

export const changeSenderCategoryAction = withActionInstrumentation(
  "changeSenderCategory",
  async ({ sender, categoryId }: { sender: string; categoryId: string }) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    const category = await prisma.category.findUnique({
      where: { id: categoryId, userId: session.user.id },
    });
    if (!category) return { error: "Category not found" };

    await prisma.newsletter.update({
      where: { email_userId: { email: sender, userId: session.user.id } },
      data: { categoryId },
    });

    revalidatePath("/smart-categories");
  },
);

export const upsertDefaultCategoriesAction = withActionInstrumentation(
  "upsertDefaultCategories",
  async (categories: { id?: string; name: string; enabled: boolean }[]) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    for (const { id, name, enabled } of categories) {
      const description = Object.values(defaultCategory).find(
        (c) => c.name === name,
      )?.description;

      if (enabled) {
        await upsertCategory(session.user.id, { name, description });
      } else {
        if (id) await deleteCategory(session.user.id, id);
      }
    }

    revalidatePath("/smart-categories");
  },
);

export const createCategoryAction = withActionInstrumentation(
  "createCategory",
  async (unsafeData: CreateCategoryBody) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    const { success, data, error } = createCategoryBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await upsertCategory(session.user.id, data);

    revalidatePath("/smart-categories");
  },
);

export const deleteCategoryAction = withActionInstrumentation(
  "deleteCategory",
  async (categoryId: string) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    await deleteCategory(session.user.id, categoryId);

    revalidatePath("/smart-categories");
  },
);

async function deleteCategory(userId: string, categoryId: string) {
  await prisma.category.delete({ where: { id: categoryId, userId } });
}

async function upsertCategory(userId: string, newCategory: CreateCategoryBody) {
  try {
    if (newCategory.id) {
      const category = await prisma.category.update({
        where: { id: newCategory.id, userId },
        data: {
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    } else {
      const category = await prisma.category.create({
        data: {
          userId,
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    }
  } catch (error) {
    if (isDuplicateError(error, "name"))
      return { error: "Category with this name already exists" };

    throw error;
  }
}

export const setAutoCategorizeAction = withActionInstrumentation(
  "setAutoCategorize",
  async (autoCategorizeSenders: boolean) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { autoCategorizeSenders },
    });

    return { autoCategorizeSenders };
  },
);
