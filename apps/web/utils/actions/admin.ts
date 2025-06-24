"use server";

import { z } from "zod";
import { processHistoryForUser as processGmailHistory } from "@/app/api/google/webhook/process-history";
import { processHistoryForUser as processOutlookHistory } from "@/app/api/outlook/webhook/process-history";
import { createScopedLogger } from "@/utils/logger";
import { deleteUser } from "@/utils/user/delete";
import prisma from "@/utils/prisma";
import { adminActionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("Admin Action");

export const adminProcessHistoryAction = adminActionClient
  .metadata({ name: "adminProcessHistory" })
  .schema(
    z.object({
      emailAddress: z.string(),
      historyId: z.number().optional(),
      startHistoryId: z.number().optional(),
    }),
  )
  .action(
    async ({ parsedInput: { emailAddress, historyId, startHistoryId } }) => {
      // Get the email account to determine the provider
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: emailAddress.toLowerCase() },
        select: {
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      const provider = emailAccount.account?.provider;

      if (provider === "google") {
        await processGmailHistory(
          {
            emailAddress,
            historyId: historyId ? historyId : 0,
          },
          {
            startHistoryId: startHistoryId
              ? startHistoryId.toString()
              : undefined,
          },
        );
      } else if (provider === "microsoft-entra-id") {
        // For Outlook, we need to get the subscription ID
        const subscription = await prisma.emailAccount.findUnique({
          where: { email: emailAddress.toLowerCase() },
          select: {
            watchEmailsSubscriptionId: true,
          },
        });

        if (!subscription?.watchEmailsSubscriptionId) {
          throw new SafeError("No subscription ID found for Outlook account");
        }

        // For Outlook, we need to get the message ID from the history ID
        // This is a simplified version - you might need to adjust this based on your needs
        await processOutlookHistory({
          subscriptionId: subscription.watchEmailsSubscriptionId,
          resourceData: {
            id: historyId?.toString() || "0",
            conversationId: startHistoryId?.toString(),
          },
        });
      } else {
        throw new SafeError(`Unsupported provider: ${provider}`);
      }
    },
  );

export const adminDeleteAccountAction = adminActionClient
  .metadata({ name: "adminDeleteAccount" })
  .schema(z.object({ email: z.string() }))
  .action(async ({ parsedInput: { email } }) => {
    try {
      const userToDelete = await prisma.user.findUnique({ where: { email } });
      if (!userToDelete) throw new SafeError("User not found");

      await deleteUser({ userId: userToDelete.id });
    } catch (error) {
      logger.error("Failed to delete user", { email, error });
      throw new SafeError(
        `Failed to delete user: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { success: "User deleted" };
  });
