import uniqBy from "lodash/uniqBy";
import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { GmailLabel } from "@/utils/gmail/label";
import { hasAiAccess, isPremium } from "@/utils/premium";
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

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      userId: true,
      about: true,
      lastSyncedHistoryId: true,
      coldEmailBlocker: true,
      coldEmailPrompt: true,
      coldEmailDigest: true,
      autoCategorizeSenders: true,
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      rules: {
        where: { enabled: true },
        include: { actions: true, categoryFilters: true },
      },
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: {
              lemonSqueezyRenewsAt: true,
              stripeSubscriptionStatus: true,
              tier: true,
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
    emailAccount.user.premium?.stripeSubscriptionStatus || null,
  )
    ? emailAccount.user.premium
    : undefined;

  if (!premium) {
    logger.info("Account not premium", {
      email,
      emailAccountId: emailAccount.id,
      lemonSqueezyRenewsAt: emailAccount.user.premium?.lemonSqueezyRenewsAt,
      stripeSubscriptionStatus:
        emailAccount.user.premium?.stripeSubscriptionStatus,
    });
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      accessToken: emailAccount.account?.access_token,
      refreshToken: emailAccount.account?.refresh_token,
      expiresAt: emailAccount.account?.expires_at,
    });
    return NextResponse.json({ ok: true });
  }

  const userHasAiAccess = hasAiAccess(premium.tier, emailAccount.user.aiApiKey);

  if (!userHasAiAccess) {
    logger.trace("Does not have ai access", {
      email,
      emailAccountId: emailAccount.id,
    });
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      accessToken: emailAccount.account?.access_token,
      refreshToken: emailAccount.account?.refresh_token,
      expiresAt: emailAccount.account?.expires_at,
    });
    return NextResponse.json({ ok: true });
  }

  const hasAutomationRules = emailAccount.rules.length > 0;
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
    const gmail = await getGmailClientWithRefresh({
      accessToken: emailAccount.account?.access_token,
      refreshToken: emailAccount.account?.refresh_token,
      expiresAt: emailAccount.account?.expires_at,
      emailAccountId: emailAccount.id,
    });

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
        gmail,
        accessToken: emailAccount.account?.access_token,
        hasAutomationRules,
        hasAiAccess: userHasAiAccess,
        rules: emailAccount.rules,
        emailAccount,
      });
    } else {
      logger.info("No history", {
        startHistoryId,
        decodedData,
      });

      // important to save this or we can get into a loop with never receiving history
      await updateLastSyncedHistoryId({
        emailAccountId: emailAccount.id,
        lastSyncedHistoryId: historyId.toString(),
      });
    }

    logger.info("Completed processing history", { decodedData });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      logger.warn("Invalid grant", { email });
      return NextResponse.json({ ok: true });
    }

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
    // returning 200 here, as otherwise PubSub will call the webhook over and over
    return NextResponse.json({ error: true });
  }
}

async function processHistory(options: ProcessHistoryOptions) {
  const { history, emailAccount } = options;
  const { email: userEmail, id: emailAccountId } = emailAccount;

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
          { extra: { userEmail, messageId: m.message?.id } },
          userEmail,
        );
        logger.error("Error processing history item", {
          userEmail,
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

  await updateLastSyncedHistoryId({
    emailAccountId,
    lastSyncedHistoryId,
  });
}

async function updateLastSyncedHistoryId({
  emailAccountId,
  lastSyncedHistoryId,
}: {
  emailAccountId: string;
  lastSyncedHistoryId?: string | null;
}) {
  if (!lastSyncedHistoryId) return;
  await prisma.emailAccount.update({
    where: { id: emailAccountId },
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
