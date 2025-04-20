"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateCategoryBody,
  createCategoryBody,
} from "@/utils/actions/categorize.validation";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { defaultCategory } from "@/utils/categories";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  categorizeSender,
  updateCategoryForSender,
} from "@/utils/categorize/senders/categorize";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { isActionError } from "@/utils/error";
import {
  deleteEmptyCategorizeSendersQueues,
  publishToAiCategorizeSendersQueue,
} from "@/utils/upstash/categorize-senders";
import { createScopedLogger } from "@/utils/logger";
import { saveCategorizationTotalItems } from "@/utils/redis/categorization-progress";
import { getSenders } from "@/app/api/user/categorize/senders/uncategorized/get-senders";
import { extractEmailAddress } from "@/utils/email";

const logger = createScopedLogger("actions/categorize");

export const bulkCategorizeSendersAction = withActionInstrumentation(
  "bulkCategorizeSenders",
  async () => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { user } = sessionResult;

    const userResult = await validateUserAndAiAccess({ email: user.email });
    if (isActionError(userResult)) return userResult;

    // Delete empty queues as Qstash has a limit on how many queues we can have
    // We could run this in a cron too but simplest to do here for now
    deleteEmptyCategorizeSendersQueues({ skipEmail: user.email }).catch(
      (error) => {
        logger.error("Error deleting empty queues", { error });
      },
    );

    const LIMIT = 100;

    async function getUncategorizedSenders(offset: number) {
      const result = await getSenders({
        userId: user.id,
        limit: LIMIT,
        offset,
      });
      const allSenders = result.map((sender) =>
        extractEmailAddress(sender.from),
      );
      const existingSenders = await prisma.newsletter.findMany({
        where: {
          email: { in: allSenders },
          emailAccountId: user.email,
          category: { isNot: null },
        },
        select: { email: true },
      });
      const existingSenderEmails = new Set(existingSenders.map((s) => s.email));
      const uncategorizedSenders = allSenders.filter(
        (email) => !existingSenderEmails.has(email),
      );

      return uncategorizedSenders;
    }

    let totalUncategorizedSenders = 0;
    let uncategorizedSenders: string[] = [];
    for (let i = 0; i < 20; i++) {
      const newUncategorizedSenders = await getUncategorizedSenders(i * LIMIT);

      logger.trace("Got uncategorized senders", {
        userId: user.id,
        uncategorizedSenders: newUncategorizedSenders.length,
      });

      if (newUncategorizedSenders.length === 0) continue;
      uncategorizedSenders.push(...newUncategorizedSenders);
      totalUncategorizedSenders += newUncategorizedSenders.length;

      await saveCategorizationTotalItems({
        email: user.email,
        totalItems: totalUncategorizedSenders,
      });

      // publish to qstash
      await publishToAiCategorizeSendersQueue({
        email: user.email,
        senders: uncategorizedSenders,
      });

      uncategorizedSenders = [];
    }

    logger.info("Queued senders for categorization", {
      userId: user.id,
      totalUncategorizedSenders,
    });

    return { totalUncategorizedSenders };
  },
);

export const categorizeSenderAction = withActionInstrumentation(
  "categorizeSender",
  async (senderAddress: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user: u, session } = sessionResult;

    if (!session.accessToken) return { error: "No access token" };

    const userResult = await validateUserAndAiAccess({ email: u.email });
    if (isActionError(userResult)) return userResult;
    const { emailAccount } = userResult;

    const result = await categorizeSender(
      senderAddress,
      emailAccount,
      gmail,
      session.accessToken,
    );

    revalidatePath("/smart-categories");

    return result;
  },
);

export const changeSenderCategoryAction = withActionInstrumentation(
  "changeSenderCategory",
  async ({ sender, categoryId }: { sender: string; categoryId: string }) => {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const category = await prisma.category.findUnique({
      where: { id: categoryId, emailAccountId: session.user.email },
    });
    if (!category) return { error: "Category not found" };

    await updateCategoryForSender({
      userEmail: session.user.email,
      sender,
      categoryId,
    });

    revalidatePath("/smart-categories");
  },
);

export const upsertDefaultCategoriesAction = withActionInstrumentation(
  "upsertDefaultCategories",
  async (categories: { id?: string; name: string; enabled: boolean }[]) => {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    for (const { id, name, enabled } of categories) {
      const description = Object.values(defaultCategory).find(
        (c) => c.name === name,
      )?.description;

      if (enabled) {
        await upsertCategory(session.user.email, { name, description });
      } else {
        if (id) await deleteCategory(session.user.email, id);
      }
    }

    revalidatePath("/smart-categories");
  },
);

export const createCategoryAction = withActionInstrumentation(
  "createCategory",
  async (unsafeData: CreateCategoryBody) => {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const { success, data, error } = createCategoryBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await upsertCategory(session.user.email, data);

    revalidatePath("/smart-categories");
  },
);

export const deleteCategoryAction = withActionInstrumentation(
  "deleteCategory",
  async (categoryId: string) => {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    await deleteCategory(session.user.email, categoryId);

    revalidatePath("/smart-categories");
  },
);

async function deleteCategory(email: string, categoryId: string) {
  await prisma.category.delete({
    where: { id: categoryId, emailAccountId: email },
  });
}

async function upsertCategory(email: string, newCategory: CreateCategoryBody) {
  try {
    if (newCategory.id) {
      const category = await prisma.category.update({
        where: { id: newCategory.id, emailAccountId: email },
        data: {
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    } else {
      const category = await prisma.category.create({
        data: {
          emailAccountId: email,
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
    const email = session?.user.email;
    if (!email) return { error: "Not authenticated" };

    await prisma.emailAccount.update({
      where: { email },
      data: { autoCategorizeSenders },
    });

    return { autoCategorizeSenders };
  },
);

export const removeAllFromCategoryAction = withActionInstrumentation(
  "removeAllFromCategory",
  async (categoryName: string) => {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    await prisma.newsletter.updateMany({
      where: {
        category: { name: categoryName },
        emailAccountId: session.user.email,
      },
      data: { categoryId: null },
    });

    revalidatePath("/smart-categories");
  },
);
