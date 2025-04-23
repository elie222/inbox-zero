"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  type CreateCategoryBody,
  createCategoryBody,
} from "@/utils/actions/categorize.validation";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { defaultCategory } from "@/utils/categories";
import {
  categorizeSender,
  updateCategoryForSender,
} from "@/utils/categorize/senders/categorize";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { isActionError, SafeError } from "@/utils/error";
import {
  deleteEmptyCategorizeSendersQueues,
  publishToAiCategorizeSendersQueue,
} from "@/utils/upstash/categorize-senders";
import { createScopedLogger } from "@/utils/logger";
import { saveCategorizationTotalItems } from "@/utils/redis/categorization-progress";
import { getSenders } from "@/app/api/user/categorize/senders/uncategorized/get-senders";
import { extractEmailAddress } from "@/utils/email";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";

const logger = createScopedLogger("actions/categorize");

export const bulkCategorizeSendersAction = actionClient
  .metadata({ name: "bulkCategorizeSenders" })
  .action(async ({ ctx: { email } }) => {
    const userResult = await validateUserAndAiAccess({ email });
    if (isActionError(userResult)) return userResult;

    // Delete empty queues as Qstash has a limit on how many queues we can have
    // We could run this in a cron too but simplest to do here for now
    deleteEmptyCategorizeSendersQueues({ skipEmail: email }).catch((error) => {
      logger.error("Error deleting empty queues", { error });
    });

    const LIMIT = 100;

    async function getUncategorizedSenders(offset: number) {
      const result = await getSenders({
        emailAccountId: email,
        limit: LIMIT,
        offset,
      });
      const allSenders = result.map((sender) =>
        extractEmailAddress(sender.from),
      );
      const existingSenders = await prisma.newsletter.findMany({
        where: {
          email: { in: allSenders },
          emailAccountId: email,
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
        email,
        uncategorizedSenders: newUncategorizedSenders.length,
      });

      if (newUncategorizedSenders.length === 0) continue;
      uncategorizedSenders.push(...newUncategorizedSenders);
      totalUncategorizedSenders += newUncategorizedSenders.length;

      await saveCategorizationTotalItems({
        email,
        totalItems: totalUncategorizedSenders,
      });

      // publish to qstash
      await publishToAiCategorizeSendersQueue({
        email,
        senders: uncategorizedSenders,
      });

      uncategorizedSenders = [];
    }

    logger.info("Queued senders for categorization", {
      email,
      totalUncategorizedSenders,
    });

    return { totalUncategorizedSenders };
  });

export const categorizeSenderAction = actionClient
  .metadata({ name: "categorizeSender" })
  .schema(z.object({ senderAddress: z.string() }))
  .action(
    async ({ ctx: { email, session }, parsedInput: { senderAddress } }) => {
      const gmail = await getGmailClientForEmail({ email });

      const userResult = await validateUserAndAiAccess({ email });
      if (isActionError(userResult)) return userResult;
      const { emailAccount } = userResult;

      if (!session.accessToken) throw new SafeError("No access token");

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

export const changeSenderCategoryAction = actionClient
  .metadata({ name: "changeSenderCategory" })
  .schema(z.object({ sender: z.string(), categoryId: z.string() }))
  .action(async ({ ctx: { email }, parsedInput: { sender, categoryId } }) => {
    const category = await prisma.category.findUnique({
      where: { id: categoryId, emailAccountId: email },
    });
    if (!category) return { error: "Category not found" };

    await updateCategoryForSender({
      userEmail: email,
      sender,
      categoryId,
    });

    revalidatePath("/smart-categories");
  });

export const upsertDefaultCategoriesAction = actionClient
  .metadata({ name: "upsertDefaultCategories" })
  .schema(
    z.object({
      categories: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          enabled: z.boolean(),
        }),
      ),
    }),
  )
  .action(async ({ ctx: { email }, parsedInput: { categories } }) => {
    for (const { id, name, enabled } of categories) {
      const description = Object.values(defaultCategory).find(
        (c) => c.name === name,
      )?.description;

      if (enabled) {
        await upsertCategory({ email, newCategory: { name, description } });
      } else {
        if (id) await deleteCategory({ email, categoryId: id });
      }
    }

    revalidatePath("/smart-categories");
  });

export const createCategoryAction = actionClient
  .metadata({ name: "createCategory" })
  .schema(createCategoryBody)
  .action(async ({ ctx: { email }, parsedInput: { name, description } }) => {
    await upsertCategory({ email, newCategory: { name, description } });

    revalidatePath("/smart-categories");
  });

export const deleteCategoryAction = actionClient
  .metadata({ name: "deleteCategory" })
  .schema(z.object({ categoryId: z.string() }))
  .action(async ({ ctx: { email }, parsedInput: { categoryId } }) => {
    await deleteCategory({ email, categoryId });

    revalidatePath("/smart-categories");
  });

async function deleteCategory({
  email,
  categoryId,
}: {
  email: string;
  categoryId: string;
}) {
  await prisma.category.delete({
    where: { id: categoryId, emailAccountId: email },
  });
}

async function upsertCategory({
  email,
  newCategory,
}: {
  email: string;
  newCategory: CreateCategoryBody;
}) {
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

export const setAutoCategorizeAction = actionClient
  .metadata({ name: "setAutoCategorize" })
  .schema(z.object({ autoCategorizeSenders: z.boolean() }))
  .action(
    async ({ ctx: { email }, parsedInput: { autoCategorizeSenders } }) => {
      await prisma.emailAccount.update({
        where: { email },
        data: { autoCategorizeSenders },
      });

      return { autoCategorizeSenders };
    },
  );

export const removeAllFromCategoryAction = actionClient
  .metadata({ name: "removeAllFromCategory" })
  .schema(z.object({ categoryName: z.string() }))
  .action(async ({ ctx: { email }, parsedInput: { categoryName } }) => {
    await prisma.newsletter.updateMany({
      where: {
        category: { name: categoryName },
        emailAccountId: email,
      },
      data: { categoryId: null },
    });

    revalidatePath("/smart-categories");
  });
