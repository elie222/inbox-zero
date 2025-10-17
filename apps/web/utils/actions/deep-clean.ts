"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { actionClient } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";
import {
  publishArchiveCategoryQueue,
  publishMarkAsReadCategoryQueue,
} from "@/utils/upstash/bulk-operations";
import { getTopSendersForDeepClean } from "@/utils/upstash/deep-clean-categorization";
import { publishToAiCategorizeSendersQueue } from "@/utils/upstash/categorize-senders";
import { saveCategorizationTotalItems } from "@/utils/redis/categorization-progress";
import {
  bulkCategorySchema,
  bulkSendersSchema,
  categorizeMoreSendersSchema,
} from "@/utils/actions/deep-clean.validation";
import { SafeError } from "@/utils/error";

export const bulkCategoryAction = actionClient
  .metadata({ name: "bulkCategory" })
  .schema(bulkCategorySchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { category, action },
    }): Promise<{
      success: boolean;
      count: number;
      operationId: string | null;
    }> => {
      await validateUserAndAiAccess({ emailAccountId });

      logger.info("Bulk category operation", {
        category,
        action,
        emailAccountId,
      });

      const senders = await prisma.newsletter.findMany({
        where: {
          emailAccountId,
          categoryId: { not: null },
          category: { name: category },
        },
        select: { email: true },
      });

      if (senders.length === 0) {
        return {
          success: true,
          count: 0,
          operationId: null,
        };
      }

      logger.info("Found senders", {
        category,
        senderCount: senders.length,
      });

      const operationId = `${action}-${category}-${Date.now()}`;

      switch (action) {
        case "archive": {
          await publishArchiveCategoryQueue({
            emailAccountId,
            operationId,
            category,
            senders: senders.map((s) => s.email),
          });
          break;
        }
        case "mark-read": {
          await publishMarkAsReadCategoryQueue({
            emailAccountId,
            operationId,
            category,
            senders: senders.map((s) => s.email),
          });
          break;
        }
        default: {
          logger.error("Invalid action", { action });
          throw new SafeError(`Invalid action: ${action}`);
        }
      }

      logger.info("Queued bulk category operation", {
        emailAccountId,
        operationId,
        category,
        senderCount: senders.length,
      });

      return {
        success: true,
        count: senders.length,
        operationId,
      };
    },
  );

export const bulkSendersAction = actionClient
  .metadata({ name: "bulkSenders" })
  .schema(bulkSendersSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { senders, action, category },
    }): Promise<{
      success: boolean;
      count: number;
      operationId: string | null;
    }> => {
      await validateUserAndAiAccess({ emailAccountId });

      logger.info("Bulk senders operation", {
        senderCount: senders.length,
        action,
        emailAccountId,
        category,
      });

      if (senders.length === 0) {
        return {
          success: true,
          count: 0,
          operationId: null,
        };
      }

      const operationId = `${action}-${Date.now()}`;

      switch (action) {
        case "archive": {
          await publishArchiveCategoryQueue({
            emailAccountId,
            operationId,
            category,
            senders,
          });
          break;
        }
        case "mark-read": {
          await publishMarkAsReadCategoryQueue({
            emailAccountId,
            operationId,
            category,
            senders,
          });
          break;
        }
        default: {
          logger.error("Invalid action", { action });
          throw new SafeError(`Invalid action: ${action}`);
        }
      }

      logger.info("Queued bulk senders operation", {
        emailAccountId,
        operationId,
        senderCount: senders.length,
      });

      return {
        success: true,
        count: senders.length,
        operationId,
      };
    },
  );

export const categorizeMoreSendersAction = actionClient
  .metadata({ name: "categorizeMoreSenders" })
  .schema(categorizeMoreSendersSchema)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { limit } }) => {
      await validateUserAndAiAccess({ emailAccountId });

      logger.info("Triggering categorize more senders", {
        emailAccountId,
        limit,
      });

      // First, try to get uncategorized senders from Newsletter table
      let sendersToCategorize = await getTopSendersForDeepClean({
        emailAccountId,
        limit,
      });

      logger.info("Found senders in Newsletter table", {
        count: sendersToCategorize.length,
      });

      // If we have very few senders (<10), fetch more from EmailMessage table
      // This handles the case where user hasn't visited bulk-unsubscribe yet
      if (sendersToCategorize.length < 10) {
        logger.info("Fetching additional senders from EmailMessage table");

        // Get senders directly from EmailMessage table
        const emailSenders = await prisma.emailMessage.findMany({
          where: {
            emailAccountId,
            sent: false,
          },
          select: {
            from: true,
            fromName: true,
          },
          distinct: ["from"],
          take: limit * 2, // Get more to account for already categorized ones
          orderBy: {
            date: "desc", // Most recent first
          },
        });

        // Check which ones aren't already categorized
        const existingCategorized = await prisma.newsletter.findMany({
          where: {
            emailAccountId,
            categoryId: { not: null },
          },
          select: { email: true },
        });

        const categorizedSet = new Set(existingCategorized.map((n) => n.email));
        const newSenders = emailSenders
          .filter((s) => !categorizedSet.has(s.from))
          .slice(0, limit);

        // Upsert these senders into Newsletter table so they can be tracked
        await Promise.all(
          newSenders.map((sender) =>
            prisma.newsletter.upsert({
              where: {
                email_emailAccountId: {
                  email: sender.from,
                  emailAccountId,
                },
              },
              update: {},
              create: {
                email: sender.from,
                emailAccountId,
              },
            }),
          ),
        );

        sendersToCategorize = newSenders.map((s) => s.from);

        logger.info("Added senders from EmailMessage", {
          newCount: sendersToCategorize.length,
        });
      }

      if (sendersToCategorize.length === 0) {
        return {
          success: true,
          queuedCount: 0,
          message: "No more senders to categorize",
        };
      }

      // Initialize progress tracking in Redis
      await saveCategorizationTotalItems({
        emailAccountId,
        totalItems: sendersToCategorize.length,
      });

      // Trigger categorization using existing queue system
      await publishToAiCategorizeSendersQueue({
        emailAccountId,
        senders: sendersToCategorize,
      });

      logger.info("Queued more senders for categorization", {
        emailAccountId,
        queuedCount: sendersToCategorize.length,
      });

      revalidatePath(prefixPath(emailAccountId, "/deep-clean"));

      return {
        success: true,
        queuedCount: sendersToCategorize.length,
        message: `Queued ${sendersToCategorize.length} senders for categorization`,
      };
    },
  );
