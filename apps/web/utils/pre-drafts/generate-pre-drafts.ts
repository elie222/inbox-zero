import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";
import { getEmailAccountWithAI } from "@/utils/llms/get-email-account-with-ai";
import { GmailProvider } from "@/utils/email/google";
import { getGmailClient } from "@/utils/gmail/client";
import { draftEmail } from "@/utils/gmail/mail";
import type { ParsedMessage } from "@/utils/types";

const logger = createScopedLogger("pre-drafts");

const DEFAULT_MAX_PER_DAY = 10;

interface PreDraftResult {
  threadId: string;
  success: boolean;
  draftId?: string;
  error?: string;
}

/**
 * Generates pre-drafts for threads that need a reply.
 * Creates drafts in the user's Gmail/Outlook drafts folder.
 */
export async function generatePreDraftsForAccount(
  emailAccountId: string,
): Promise<PreDraftResult[]> {
  const results: PreDraftResult[] = [];

  try {
    // get email account with settings
    const emailAccountWithSettings = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        preDraftsEnabled: true,
        preDraftsMaxPerDay: true,
        account: {
          select: {
            providerId: true,
          },
        },
      },
    });

    if (!emailAccountWithSettings) {
      logger.warn("Email account not found", { emailAccountId });
      return results;
    }

    if (!emailAccountWithSettings.preDraftsEnabled) {
      logger.debug("Pre-drafts not enabled for account", { emailAccountId });
      return results;
    }

    // check how many drafts we've created today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayDraftCount = await prisma.preDraft.count({
      where: {
        emailAccountId,
        createdAt: { gte: todayStart },
        status: { in: ["CREATED", "PENDING"] },
      },
    });

    const maxPerDay =
      emailAccountWithSettings.preDraftsMaxPerDay || DEFAULT_MAX_PER_DAY;
    const remainingQuota = maxPerDay - todayDraftCount;

    if (remainingQuota <= 0) {
      logger.info("Daily pre-draft limit reached", {
        emailAccountId,
        maxPerDay,
        todayDraftCount,
      });
      return results;
    }

    // get threads needing reply that don't have pre-drafts yet
    const threadsNeedingReply = await prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        type: "NEEDS_REPLY",
        resolved: false,
      },
      orderBy: { sentAt: "desc" },
      take: remainingQuota,
      distinct: ["threadId"],
    });

    // filter out threads that already have pre-drafts
    const existingPreDrafts = await prisma.preDraft.findMany({
      where: {
        emailAccountId,
        threadId: { in: threadsNeedingReply.map((t) => t.threadId) },
        status: { in: ["CREATED", "PENDING"] },
      },
      select: { threadId: true },
    });

    const existingThreadIds = new Set(existingPreDrafts.map((p) => p.threadId));
    const threadsToProcess = threadsNeedingReply.filter(
      (t) => !existingThreadIds.has(t.threadId),
    );

    if (threadsToProcess.length === 0) {
      logger.debug("No new threads to pre-draft", { emailAccountId });
      return results;
    }

    logger.info("Processing pre-drafts", {
      emailAccountId,
      threadCount: threadsToProcess.length,
    });

    // get the email account with AI config
    const emailAccount = await getEmailAccountWithAI({ emailAccountId });
    if (!emailAccount) {
      logger.error("Failed to get email account with AI", { emailAccountId });
      return results;
    }

    // only supporting Gmail for now
    const isGmail =
      emailAccountWithSettings.account.providerId === "google" ||
      emailAccountWithSettings.account.providerId === "google-workspace";

    if (!isGmail) {
      logger.info("Pre-drafts only supported for Gmail accounts currently", {
        emailAccountId,
        provider: emailAccountWithSettings.account.providerId,
      });
      return results;
    }

    // get Gmail client
    const gmail = await getGmailClient({ emailAccountId });
    const provider = new GmailProvider(gmail, logger);

    // process each thread
    for (const tracker of threadsToProcess) {
      const result = await generatePreDraftForThread({
        emailAccountId,
        emailAccount,
        threadId: tracker.threadId,
        messageId: tracker.messageId,
        provider,
        gmail,
      });
      results.push(result);
    }

    return results;
  } catch (error) {
    logger.error("Failed to generate pre-drafts", { error, emailAccountId });
    return results;
  }
}

async function generatePreDraftForThread({
  emailAccountId,
  emailAccount,
  threadId,
  messageId,
  provider,
  gmail,
}: {
  emailAccountId: string;
  emailAccount: Awaited<ReturnType<typeof getEmailAccountWithAI>>;
  threadId: string;
  messageId: string;
  provider: GmailProvider;
  gmail: Awaited<ReturnType<typeof getGmailClient>>;
}): Promise<PreDraftResult> {
  try {
    // create pending record first
    await prisma.preDraft.upsert({
      where: { emailAccountId_threadId: { emailAccountId, threadId } },
      create: {
        emailAccountId,
        threadId,
        messageId,
        status: "PENDING",
      },
      update: {
        messageId,
        status: "PENDING",
        errorMessage: null,
      },
    });

    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    // generate the draft content
    const draftContent = await fetchMessagesAndGenerateDraft(
      emailAccount,
      threadId,
      provider,
      undefined,
      logger,
    );

    // get the thread to find the message we're replying to
    const threadMessages = await provider.getThreadMessages(threadId);
    const lastMessage = threadMessages.at(-1) as ParsedMessage | undefined;

    if (!lastMessage) {
      throw new Error("No messages in thread");
    }

    // create the draft in Gmail
    const draftResult = await draftEmail({
      gmail,
      draftText: draftContent,
      originalEmail: lastMessage,
    });

    const draftId = draftResult?.data?.id;

    // update the pre-draft record
    await prisma.preDraft.update({
      where: { emailAccountId_threadId: { emailAccountId, threadId } },
      data: {
        draftId,
        status: "CREATED",
      },
    });

    logger.info("Pre-draft created successfully", {
      emailAccountId,
      threadId,
      draftId,
    });

    return { threadId, success: true, draftId: draftId || undefined };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error("Failed to generate pre-draft for thread", {
      error,
      emailAccountId,
      threadId,
    });

    // update the record with error status
    await prisma.preDraft
      .update({
        where: { emailAccountId_threadId: { emailAccountId, threadId } },
        data: {
          status: "FAILED",
          errorMessage,
        },
      })
      .catch((e) => {
        logger.error("Failed to update pre-draft error status", { error: e });
      });

    return { threadId, success: false, error: errorMessage };
  }
}
