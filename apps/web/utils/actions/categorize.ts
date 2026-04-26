"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createEmailProvider } from "@/utils/email/provider";
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
import { startBulkCategorization } from "@/utils/categorize/senders/start-bulk-categorization";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { SafeError } from "@/utils/error";
import { actionClient } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";

export const bulkCategorizeSendersAction = actionClient
  .metadata({ name: "bulkCategorizeSenders" })
  .action(async ({ ctx: { emailAccountId, logger, provider } }) => {
    await validateUserAndAiAccess({ emailAccountId });

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    const result = await startBulkCategorization({
      emailAccountId,
      emailProvider,
      logger,
    });

    return { totalUncategorizedSenders: result.totalQueuedSenders };
  });

export const categorizeSenderAction = actionClient
  .metadata({ name: "categorizeSender" })
  .inputSchema(z.object({ senderAddress: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { senderAddress },
    }) => {
      const userResult = await validateUserAndAiAccess({ emailAccountId });
      const { emailAccount } = userResult;

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const result = await categorizeSender(
        senderAddress,
        emailAccount,
        emailProvider,
      );

      revalidatePath(prefixPath(emailAccountId, "/smart-categories"));

      return result;
    },
  );

export const changeSenderCategoryAction = actionClient
  .metadata({ name: "changeSenderCategory" })
  .inputSchema(z.object({ sender: z.string(), categoryId: z.string() }))
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
  .inputSchema(
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
  .inputSchema(createCategoryBody)
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
  .inputSchema(z.object({ categoryId: z.string() }))
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
  .inputSchema(z.object({ autoCategorizeSenders: z.boolean() }))
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
  .inputSchema(z.object({ categoryName: z.string() }))
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
