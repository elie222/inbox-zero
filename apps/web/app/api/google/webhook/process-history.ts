import uniqBy from "lodash/uniqBy";
import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { GmailLabel } from "@/utils/gmail/label";
import { hasAiAccess, hasColdEmailAccess, isPremium } from "@/utils/premium";
import { ColdEmailSetting } from "@prisma/client";
import { captureException } from "@/utils/error";
import { unwatchEmails } from "@/app/api/google/watch/controller";
import type { ProcessHistoryOptions } from "@/app/api/google/webhook/types";
import { processHistoryItem } from "@/app/api/google/webhook/process-history-item";
import { logger } from "@/app/api/google/webhook/logger";
import { getHistory } from "@/utils/gmail/history";

export async function processHistoryForUser(
  decodedData: {
    emailAddress: string;
    historyId: number;
  },
  options?: { startHistoryId?: string },
) {
  const { emailAddress, historyId } = decodedData;
  // All emails in the database are stored in lowercase
  // But it's possible that the email address in the webhook is not
  // So we need to convert it to lowercase
  const email = emailAddress.toLowerCase();

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { email },
    select: {
      email: true,
      userId: true,
      about: true,
      lastSyncedHistoryId: true,
      coldEmailBlocker: true,
      coldEmailPrompt: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      autoCategorizeSenders: true,
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
          providerAccountId: true,
        },
      },
      user: {
        select: {
          rules: {
            where: { enabled: true },
            include: { actions: true, categoryFilters: true },
          },
          premium: {
            select: {
              lemonSqueezyRenewsAt: true,
              coldEmailBlockerAccess: true,
              aiAutomationAccess: true,
            },
          },
        },
      },
    },
  });

  if (!emailAccount) {
    logger.error("Account not found", { email });
    return NextResponse.json({ ok: true });
  }

  const premium = isPremium(
    emailAccount.user.premium?.lemonSqueezyRenewsAt || null,
  )
    ? emailAccount.user.premium
    : undefined;

  if (!premium) {
    logger.info("Account not premium", {
      email,
      lemonSqueezyRenewsAt: emailAccount.user.premium?.lemonSqueezyRenewsAt,
    });
    await unwatchEmails({
      email: emailAccount.email,
      access_token: emailAccount.account?.access_token ?? null,
      refresh_token: emailAccount.account?.refresh_token ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  const userHasAiAccess = hasAiAccess(
    premium.aiAutomationAccess,
    emailAccount.aiApiKey,
  );
  const userHasColdEmailAccess = hasColdEmailAccess(
    premium.coldEmailBlockerAccess,
    emailAccount.aiApiKey,
  );

  if (!userHasAiAccess && !userHasColdEmailAccess) {
    logger.trace("Does not have hasAiOrColdEmailAccess", { email });
    await unwatchEmails({
      email: emailAccount.email,
      access_token: emailAccount.account?.access_token ?? null,
      refresh_token: emailAccount.account?.refresh_token ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  const hasAutomationRules = emailAccount.user.rules.length > 0;
  const shouldBlockColdEmails =
    emailAccount.coldEmailBlocker &&
    emailAccount.coldEmailBlocker !== ColdEmailSetting.DISABLED;
  if (!hasAutomationRules && !shouldBlockColdEmails) {
    logger.trace("Has no rules set and cold email blocker disabled", { email });
    return NextResponse.json({ ok: true });
  }

  if (
    !emailAccount.account?.access_token ||
    !emailAccount.account?.refresh_token
  ) {
    logger.error("Missing access or refresh token", { email });
    return NextResponse.json({ ok: true });
  }

  try {
    const gmail = await getGmailClientWithRefresh(
      {
        accessToken: emailAccount.account?.access_token,
        refreshToken: emailAccount.account?.refresh_token,
        expiryDate: emailAccount.account?.expires_at,
      },
      emailAccount.account?.providerAccountId,
    );

    // couldn't refresh the token
    if (!gmail) {
      logger.error("Failed to refresh token", { email });
      return NextResponse.json({ ok: true });
    }

    const startHistoryId =
      options?.startHistoryId ||
      Math.max(
        Number.parseInt(emailAccount.lastSyncedHistoryId || "0"),
        historyId - 500, // avoid going too far back
      ).toString();

    logger.info("Listing history", {
      startHistoryId,
      lastSyncedHistoryId: emailAccount.lastSyncedHistoryId,
      gmailHistoryId: startHistoryId,
      email,
    });

    const history = await getHistory(gmail, {
      // NOTE this can cause problems if we're way behind
      // NOTE this doesn't include startHistoryId in the results
      startHistoryId,
      historyTypes: ["messageAdded", "labelAdded"],
      maxResults: 500,
    });

    if (history.history) {
      logger.info("Processing history", {
        email,
        startHistoryId,
        historyId: history.historyId,
      });

      await processHistory({
        history: history.history,
        email,
        gmail,
        accessToken: emailAccount.account?.access_token,
        hasAutomationRules,
        rules: emailAccount.user.rules,
        hasColdEmailAccess: userHasColdEmailAccess,
        hasAiAutomationAccess: userHasAiAccess,
        user: emailAccount,
      });
    } else {
      logger.info("No history", {
        startHistoryId,
        decodedData,
      });

      // important to save this or we can get into a loop with never receiving history
      await updateLastSyncedHistoryId(emailAccount.email, historyId.toString());
    }

    logger.info("Completed processing history", { decodedData });

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureException(error, { extra: { decodedData } }, email);
    logger.error("Error processing webhook", {
      decodedData,
      email,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });
    return NextResponse.json({ error: true });
    // be careful about calling an error here with the wrong settings, as otherwise PubSub will call the webhook over and over
    // return NextResponse.error();
  }
}

async function processHistory(options: ProcessHistoryOptions) {
  const { history, email } = options;

  if (!history?.length) return;

  for (const h of history) {
    const historyMessages = [
      ...(h.messagesAdded || []),
      ...(h.labelsAdded || []),
    ];

    if (!historyMessages.length) continue;

    const inboxMessages = historyMessages.filter(isInboxOrSentMessage);
    const uniqueMessages = uniqBy(inboxMessages, (m) => m.message?.id);

    for (const m of uniqueMessages) {
      try {
        await processHistoryItem(m, options);
      } catch (error) {
        captureException(
          error,
          { extra: { email, messageId: m.message?.id } },
          email,
        );
        logger.error("Error processing history item", {
          email,
          messageId: m.message?.id,
          threadId: m.message?.threadId,
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
        });
      }
    }
  }

  const lastSyncedHistoryId = history[history.length - 1].id;

  await updateLastSyncedHistoryId(email, lastSyncedHistoryId);
}

async function updateLastSyncedHistoryId(
  email: string,
  lastSyncedHistoryId?: string | null,
) {
  if (!lastSyncedHistoryId) return;
  await prisma.emailAccount.update({
    where: { email },
    data: { lastSyncedHistoryId },
  });
}

const isInboxOrSentMessage = (message: {
  message?: { labelIds?: string[] | null };
}) => {
  const labels = message.message?.labelIds;

  if (!labels) return false;

  if (labels.includes(GmailLabel.INBOX) && !labels.includes(GmailLabel.DRAFT))
    return true;

  if (labels.includes(GmailLabel.SENT)) return true;

  return false;
};
