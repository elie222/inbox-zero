import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

const BATCH_SIZE = 50; // Process in smaller batches to avoid timeouts

/**
 * Find and archive expired emails for all accounts with expiration enabled.
 * Called from the existing /api/watch/all cron job.
 */
export async function cleanupExpiredEmails(logger: Logger) {
  // Find accounts with expiration enabled
  const accounts = await prisma.emailExpirationSettings.findMany({
    where: { enabled: true },
    select: {
      emailAccountId: true,
      applyLabel: true,
      emailAccount: {
        select: { email: true },
      },
    },
  });

  if (accounts.length === 0) {
    logger.info("No accounts with expiration enabled");
    return { totalArchived: 0, totalErrors: 0 };
  }

  let totalArchived = 0;
  let totalErrors = 0;

  for (const account of accounts) {
    try {
      const result = await cleanupExpiredEmailsForAccount({
        emailAccountId: account.emailAccountId,
        ownerEmail: account.emailAccount.email,
        applyLabel: account.applyLabel,
        logger,
      });
      totalArchived += result.archived;
      totalErrors += result.errors;
    } catch (error) {
      logger.error("Failed to cleanup expired emails for account", {
        emailAccountId: account.emailAccountId,
        error,
      });
      totalErrors++;
    }
  }

  logger.info("Expiration cleanup completed", { totalArchived, totalErrors });
  return { totalArchived, totalErrors };
}

async function cleanupExpiredEmailsForAccount({
  emailAccountId,
  ownerEmail,
  applyLabel,
  logger,
}: {
  emailAccountId: string;
  ownerEmail: string;
  applyLabel: boolean;
  logger: Logger;
}) {
  // Find expired emails that haven't been processed yet
  const expiredEmails = await prisma.emailMessage.findMany({
    where: {
      emailAccountId,
      inbox: true,
      expiredAt: null, // Not yet processed
      expiresAt: {
        lte: new Date(), // Expiration date has passed
      },
    },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      from: true,
      expiresAt: true,
      expirationReason: true,
    },
    take: BATCH_SIZE,
  });

  if (expiredEmails.length === 0) {
    return { archived: 0, errors: 0 };
  }

  logger.info("Found expired emails to archive", {
    emailAccountId,
    count: expiredEmails.length,
  });

  const provider = await createEmailProvider({
    emailAccountId,
    provider: "google",
    logger,
  });

  // Get or create expired label if needed
  const expiredLabel = applyLabel
    ? await provider.getOrCreateInboxZeroLabel("expired")
    : null;

  let archived = 0;
  let errors = 0;

  for (const email of expiredEmails) {
    try {
      // Archive the email using existing provider method
      // archiveThreadWithLabel removes INBOX and optionally adds a label
      await provider.archiveThreadWithLabel(
        email.threadId,
        ownerEmail,
        expiredLabel?.id,
      );

      // Update the record
      await prisma.emailMessage.update({
        where: { id: email.id },
        data: {
          inbox: false,
          expiredAt: new Date(),
        },
      });

      // Log for audit
      await prisma.expiredEmailLog.create({
        data: {
          emailAccountId,
          threadId: email.threadId,
          messageId: email.messageId,
          subject: null, // Could extract from message if needed
          from: email.from,
          expiresAt: email.expiresAt!,
          expiredAt: new Date(),
          reason: email.expirationReason,
        },
      });

      archived++;
      logger.info("Archived expired email", {
        threadId: email.threadId,
        reason: email.expirationReason,
      });
    } catch (error) {
      logger.error("Failed to archive expired email", {
        threadId: email.threadId,
        error,
      });
      errors++;
    }
  }

  return { archived, errors };
}
