"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  type CreateCategoryBody,
  createCategoryBody,
} from "@/utils/actions/categorize.validation";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { defaultCategory } from "@/utils/categories";
import {
  categorizeSender,
  updateCategoryForSender,
} from "@/utils/categorize/senders/categorize";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { SafeError } from "@/utils/error";
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
import { prefixPath } from "@/utils/path";

const logger = createScopedLogger("actions/categorize");

export const bulkCategorizeSendersAction = actionClient
  .metadata({ name: "bulkCategorizeSenders" })
  .action(async ({ ctx: { emailAccountId } }) => {
    await validateUserAndAiAccess({ emailAccountId });

    // Delete empty queues as Qstash has a limit on how many queues we can have
    // We could run this in a cron too but simplest to do here for now
    deleteEmptyCategorizeSendersQueues({
      skipEmailAccountId: emailAccountId,
    }).catch((error) => {
      logger.error("Error deleting empty queues", { error });
    });

    const LIMIT = 100;

    async function getUncategorizedSenders(offset: number) {
      const result = await getSenders({
        emailAccountId,
        limit: LIMIT,
        offset,
      });
      const allSenders = result.map((sender) =>
        extractEmailAddress(sender.from),
      );
      const existingSenders = await prisma.newsletter.findMany({
        where: {
          email: { in: allSenders },
          emailAccountId,
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
        emailAccountId,
        uncategorizedSenders: newUncategorizedSenders.length,
      });

      if (newUncategorizedSenders.length === 0) continue;
      uncategorizedSenders.push(...newUncategorizedSenders);
      totalUncategorizedSenders += newUncategorizedSenders.length;

      await saveCategorizationTotalItems({
        emailAccountId,
        totalItems: totalUncategorizedSenders,
      });

      // publish to qstash
      await publishToAiCategorizeSendersQueue({
        emailAccountId,
        senders: uncategorizedSenders,
      });

      uncategorizedSenders = [];
    }

    logger.info("Queued senders for categorization", {
      emailAccountId,
      totalUncategorizedSenders,
    });

    return { totalUncategorizedSenders };
  });

export const categorizeSenderAction = actionClient
  .metadata({ name: "categorizeSender" })
  .schema(z.object({ senderAddress: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, session },
      parsedInput: { senderAddress },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const userResult = await validateUserAndAiAccess({ emailAccountId });
      const { emailAccount } = userResult;

      if (!session.accessToken) throw new SafeError("No access token");

      const result = await categorizeSender(
        senderAddress,
        emailAccount,
        gmail,
        session.accessToken,
      );

      revalidatePath(prefixPath(emailAccountId, "/smart-categories"));

      return result;
    },
  );

export const changeSenderCategoryAction = actionClient
  .metadata({ name: "changeSenderCategory" })
  .schema(z.object({ sender: z.string(), categoryId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { sender, categoryId },
    }) => {
      const category = await prisma.category.findUnique({
        where: { id: categoryId, emailAccountId },
      });
      if (!category) throw new SafeError("Category not found");

      await updateCategoryForSender({
        emailAccountId,
        sender,
        categoryId,
      });

      revalidatePath(prefixPath(emailAccountId, "/smart-categories"));
    },
  );

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
  .action(async ({ ctx: { emailAccountId }, parsedInput: { categories } }) => {
    for (const { id, name, enabled } of categories) {
      const description = Object.values(defaultCategory).find(
        (c) => c.name === name,
      )?.description;

      if (enabled) {
        await upsertCategory({
          emailAccountId,
          newCategory: { name, description },
        });
      } else {
        if (id) await deleteCategory({ emailAccountId, categoryId: id });
      }
    }

    revalidatePath(prefixPath(emailAccountId, "/smart-categories"));
  });

export const createCategoryAction = actionClient
  .metadata({ name: "createCategory" })
  .schema(createCategoryBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { name, description } }) => {
      await upsertCategory({
        emailAccountId,
        newCategory: { name, description },
      });

      revalidatePath(prefixPath(emailAccountId, "/smart-categories"));
    },
  );

export const deleteCategoryAction = actionClient
  .metadata({ name: "deleteCategory" })
  .schema(z.object({ categoryId: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { categoryId } }) => {
    await deleteCategory({ emailAccountId, categoryId });

    revalidatePath(prefixPath(emailAccountId, "/smart-categories"));
  });

async function deleteCategory({
  emailAccountId,
  categoryId,
}: {
  emailAccountId: string;
  categoryId: string;
}) {
  await prisma.category.delete({
    where: { id: categoryId, emailAccountId },
  });
}

async function upsertCategory({
  emailAccountId,
  newCategory,
}: {
  emailAccountId: string;
  newCategory: CreateCategoryBody;
}) {
  try {
    if (newCategory.id) {
      const category = await prisma.category.update({
        where: { id: newCategory.id, emailAccountId },
        data: {
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    } else {
      const category = await prisma.category.create({
        data: {
          emailAccountId,
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    }
  } catch (error) {
    if (isDuplicateError(error, "name"))
      throw new SafeError("Category with this name already exists");

    throw error;
  }
}

export const setAutoCategorizeAction = actionClient
  .metadata({ name: "setAutoCategorize" })
  .schema(z.object({ autoCategorizeSenders: z.boolean() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { autoCategorizeSenders },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { autoCategorizeSenders },
      });
    },
  );

export const removeAllFromCategoryAction = actionClient
  .metadata({ name: "removeAllFromCategory" })
  .schema(z.object({ categoryName: z.string() }))
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { categoryName } }) => {
      await prisma.newsletter.updateMany({
        where: {
          category: { name: categoryName },
          emailAccountId,
        },
        data: { categoryId: null },
      });

      revalidatePath(prefixPath(emailAccountId, "/smart-categories"));
    },
  );
