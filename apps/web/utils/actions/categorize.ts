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
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { SafeError } from "@/utils/error";
import {
  deleteEmptyCategorizeSendersQueues,
  publishToAiCategorizeSendersQueue,
} from "@/utils/upstash/categorize-senders";
import { saveCategorizationTotalItems } from "@/utils/redis/categorization-progress";
import { getUncategorizedSenders } from "@/app/api/user/categorize/senders/uncategorized/get-uncategorized-senders";
import { actionClient } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";
import { loadEmails } from "@/utils/actions/stats";

const CATEGORIZE_SYNC_CHUNK_PAGES = 5;
const MAX_SYNC_PASSES = 20;

export const bulkCategorizeSendersAction = actionClient
  .metadata({ name: "bulkCategorizeSenders" })
  .action(async ({ ctx: { emailAccountId, logger } }) => {
    await validateUserAndAiAccess({ emailAccountId });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        account: {
          select: { provider: true },
        },
      },
    });

    if (!emailAccount?.account?.provider) {
      throw new SafeError("Email account or provider not found");
    }

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider: emailAccount.account.provider,
      logger,
    });

    // Ensure default categories exist before categorizing
    const categoriesToCreate = Object.values(defaultCategory)
      .filter((c) => c.enabled)
      .map((c) => ({
        emailAccountId,
        name: c.name,
        description: c.description,
      }));

    await prisma.category.createMany({
      data: categoriesToCreate,
      skipDuplicates: true,
    });

    // Enable auto-categorization for this email account
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { autoCategorizeSenders: true },
    });

    // Delete empty queues as Qstash has a limit on how many queues we can have
    // We could run this in a cron too but simplest to do here for now
    deleteEmptyCategorizeSendersQueues({
      skipEmailAccountId: emailAccountId,
    }).catch((error) => {
      logger.error("Error deleting empty queues", { error });
    });

    const LIMIT = 100;
    const MAX_SENDERS = 2000;

    let totalUncategorizedSenders = 0;
    let syncPasses = 0;
    let shouldLoadMoreMessages = true;
    const queuedSenderEmails = new Set<string>();

    while (
      totalUncategorizedSenders < MAX_SENDERS &&
      shouldLoadMoreMessages &&
      syncPasses < MAX_SYNC_PASSES
    ) {
      let currentOffset: number | undefined = 0;

      while (currentOffset !== undefined) {
        const result = await getUncategorizedSenders({
          emailAccountId,
          limit: LIMIT,
          offset: currentOffset,
        });

        logger.trace("Got uncategorized senders", {
          uncategorizedSenders: result.uncategorizedSenders.length,
        });

        const sendersToQueue = result.uncategorizedSenders.filter((sender) => {
          const senderKey = sender.email.trim().toLowerCase();
          if (queuedSenderEmails.has(senderKey)) return false;
          queuedSenderEmails.add(senderKey);
          return true;
        });

        if (sendersToQueue.length > 0) {
          totalUncategorizedSenders += sendersToQueue.length;

          await saveCategorizationTotalItems({
            emailAccountId,
            totalItems: totalUncategorizedSenders,
          });

          await publishToAiCategorizeSendersQueue({
            emailAccountId,
            senders: sendersToQueue,
          });
        }

        if (totalUncategorizedSenders >= MAX_SENDERS) {
          logger.info("Reached max senders limit", { MAX_SENDERS });
          break;
        }

        currentOffset = result.nextOffset;
      }

      if (totalUncategorizedSenders >= MAX_SENDERS) {
        break;
      }

      const syncResult = await loadEmails(
        {
          emailAccountId,
          emailProvider,
          logger,
        },
        {
          loadBefore: true,
          maxPages: CATEGORIZE_SYNC_CHUNK_PAGES,
        },
      );

      const loadedMoreMessages =
        syncResult.loadedAfterMessages > 0 ||
        syncResult.loadedBeforeMessages > 0;

      logger.info("Categorize sync pass completed", {
        syncPasses,
        loadedAfterMessages: syncResult.loadedAfterMessages,
        loadedBeforeMessages: syncResult.loadedBeforeMessages,
        hasMoreAfter: syncResult.hasMoreAfter,
        hasMoreBefore: syncResult.hasMoreBefore,
        totalUncategorizedSenders,
      });

      shouldLoadMoreMessages = loadedMoreMessages;

      syncPasses++;
    }

    logger.info("Queued senders for categorization", {
      totalUncategorizedSenders,
      syncPasses,
      shouldLoadMoreMessages,
    });

    return { totalUncategorizedSenders };
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
