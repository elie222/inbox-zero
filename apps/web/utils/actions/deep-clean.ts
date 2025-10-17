"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { SafeError } from "@/utils/error";
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
  archiveCategorySchema,
  categorizeMoreSendersSchema,
  markCategoryAsReadSchema,
} from "@/utils/actions/deep-clean.validation";

// Map frontend categories to backend categories
const FRONTEND_TO_BACKEND_CATEGORY = {
  Newsletter: "Newsletter",
  Marketing: "Marketing",
  Receipts: "Receipt",
  Notifications: "Notification",
  Other: null, // Will handle this separately
} as const;

export const archiveCategoryAction = actionClient
  .metadata({ name: "archiveCategory" })
  .schema(archiveCategorySchema)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { category } }) => {
      await validateUserAndAiAccess({ emailAccountId });

      logger.info("Archiving category", { category, emailAccountId });

      // Get all senders in this category
      const senders = await prisma.newsletter.findMany({
        where: {
          emailAccountId,
          categoryId: { not: null },
          category: {
            name:
              FRONTEND_TO_BACKEND_CATEGORY[
                category as keyof typeof FRONTEND_TO_BACKEND_CATEGORY
              ] || undefined,
          },
        },
        select: { email: true },
      });

      // Handle "Other" category - get all senders not in the main categories
      if (category === "Other") {
        const otherSenders = await prisma.newsletter.findMany({
          where: {
            emailAccountId,
            categoryId: { not: null },
            category: {
              name: {
                notIn: ["Newsletter", "Marketing", "Receipt", "Notification"],
              },
            },
          },
          select: { email: true },
        });
        senders.push(...otherSenders);
      }

      if (senders.length === 0) {
        throw new SafeError(`No senders found in ${category} category`);
      }

      logger.info("Found senders to archive", {
        category,
        senderCount: senders.length,
      });

      // Generate unique operation ID
      const operationId = `archive-${category}-${Date.now()}`;

      // Queue the archive operation to run in the background
      await publishArchiveCategoryQueue({
        emailAccountId,
        operationId,
        category,
        senders: senders.map((s) => s.email),
      });

      logger.info("Queued archive operation", {
        emailAccountId,
        operationId,
        category,
        senderCount: senders.length,
      });

      return {
        success: true,
        operationId,
        queuedCount: senders.length,
        message: `Queued ${senders.length} senders for archiving`,
      };
    },
  );

export const markCategoryAsReadAction = actionClient
  .metadata({ name: "markCategoryAsRead" })
  .schema(markCategoryAsReadSchema)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { category } }) => {
      await validateUserAndAiAccess({ emailAccountId });

      logger.info("Marking category as read", { category, emailAccountId });

      // Get all senders in this category
      const senders = await prisma.newsletter.findMany({
        where: {
          emailAccountId,
          categoryId: { not: null },
          category: {
            name:
              FRONTEND_TO_BACKEND_CATEGORY[
                category as keyof typeof FRONTEND_TO_BACKEND_CATEGORY
              ] || undefined,
          },
        },
        select: { email: true },
      });

      // Handle "Other" category - get all senders not in the main categories
      if (category === "Other") {
        const otherSenders = await prisma.newsletter.findMany({
          where: {
            emailAccountId,
            categoryId: { not: null },
            category: {
              name: {
                notIn: ["Newsletter", "Marketing", "Receipt", "Notification"],
              },
            },
          },
          select: { email: true },
        });
        senders.push(...otherSenders);
      }

      if (senders.length === 0) {
        throw new SafeError(`No senders found in ${category} category`);
      }

      logger.info("Found senders to mark as read", {
        category,
        senderCount: senders.length,
      });

      // Generate unique operation ID
      const operationId = `mark-read-${category}-${Date.now()}`;

      // Queue the mark-as-read operation to run in the background
      await publishMarkAsReadCategoryQueue({
        emailAccountId,
        operationId,
        category,
        senders: senders.map((s) => s.email),
      });

      logger.info("Queued mark-as-read operation", {
        emailAccountId,
        operationId,
        category,
        senderCount: senders.length,
      });

      return {
        success: true,
        operationId,
        queuedCount: senders.length,
        message: `Queued ${senders.length} senders to mark as read`,
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
