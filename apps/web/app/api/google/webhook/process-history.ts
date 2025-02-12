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

  const account = await prisma.account.findFirst({
    where: { user: { email }, provider: "google" },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      providerAccountId: true,
      userId: true,
      user: {
        select: {
          email: true,
          about: true,
          lastSyncedHistoryId: true,
          rules: {
            where: { enabled: true },
            include: { actions: true, categoryFilters: true },
          },
          coldEmailBlocker: true,
          coldEmailPrompt: true,
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: {
              lemonSqueezyRenewsAt: true,
              coldEmailBlockerAccess: true,
              aiAutomationAccess: true,
            },
          },
          autoCategorizeSenders: true,
        },
      },
    },
  });

  if (!account) {
    logger.error("Account not found", { email });
    return NextResponse.json({ ok: true });
  }

  const premium = isPremium(account.user.premium?.lemonSqueezyRenewsAt || null)
    ? account.user.premium
    : undefined;

  if (!premium) {
    logger.info("Account not premium", {
      email,
      lemonSqueezyRenewsAt: account.user.premium?.lemonSqueezyRenewsAt,
    });
    await unwatchEmails(account);
    return NextResponse.json({ ok: true });
  }

  const userHasAiAccess = hasAiAccess(
    premium.aiAutomationAccess,
    account.user.aiApiKey,
  );
  const userHasColdEmailAccess = hasColdEmailAccess(
    premium.coldEmailBlockerAccess,
    account.user.aiApiKey,
  );

  if (!userHasAiAccess && !userHasColdEmailAccess) {
    logger.trace("Does not have hasAiOrColdEmailAccess", { email });
    await unwatchEmails(account);
    return NextResponse.json({ ok: true });
  }

  const hasAutomationRules = account.user.rules.length > 0;
  const shouldBlockColdEmails =
    account.user.coldEmailBlocker &&
    account.user.coldEmailBlocker !== ColdEmailSetting.DISABLED;
  if (!hasAutomationRules && !shouldBlockColdEmails) {
    logger.trace("Has no rules set and cold email blocker disabled", { email });
    return NextResponse.json({ ok: true });
  }

  if (!account.access_token || !account.refresh_token) {
    logger.error("Missing access or refresh token", { email });
    return NextResponse.json({ ok: true });
  }

  if (!account.user.email) {
    // shouldn't ever happen
    logger.error("Missing user email", { email });
    return NextResponse.json({ ok: true });
  }

  try {
    const gmail = await getGmailClientWithRefresh(
      {
        accessToken: account.access_token,
        refreshToken: account.refresh_token,
        expiryDate: account.expires_at,
      },
      account.providerAccountId,
    );

    // couldn't refresh the token
    if (!gmail) {
      logger.error("Failed to refresh token", { email });
      return NextResponse.json({ ok: true });
    }

    const startHistoryId =
      options?.startHistoryId ||
      Math.max(
        Number.parseInt(account.user.lastSyncedHistoryId || "0"),
        historyId - 500, // avoid going too far back
      ).toString();

    logger.info("Listing history", {
      startHistoryId,
      lastSyncedHistoryId: account.user.lastSyncedHistoryId,
      gmailHistoryId: startHistoryId,
      email,
    });

    const history = await gmail.users.history.list({
      userId: "me",
      // NOTE this can cause problems if we're way behind
      // NOTE this doesn't include startHistoryId in the results
      startHistoryId,
      historyTypes: ["messageAdded", "labelAdded"],
      maxResults: 500,
    });

    if (history.data.history) {
      logger.info("Processing history", {
        email,
        startHistoryId,
        historyId: history.data.historyId,
      });

      await processHistory({
        history: history.data.history,
        email,
        gmail,
        accessToken: account.access_token,
        hasAutomationRules,
        rules: account.user.rules,
        hasColdEmailAccess: userHasColdEmailAccess,
        hasAiAutomationAccess: userHasAiAccess,
        user: {
          id: account.userId,
          email: account.user.email,
          about: account.user.about || "",
          aiProvider: account.user.aiProvider,
          aiModel: account.user.aiModel,
          aiApiKey: account.user.aiApiKey,
          coldEmailPrompt: account.user.coldEmailPrompt,
          coldEmailBlocker: account.user.coldEmailBlocker,
          autoCategorizeSenders: account.user.autoCategorizeSenders,
        },
      });
    } else {
      logger.info("No history", {
        startHistoryId,
        decodedData,
      });

      // important to save this or we can get into a loop with never receiving history
      await updateLastSyncedHistoryId(account.user.email, historyId.toString());
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
          : String(error),
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
              : String(error),
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
  await prisma.user.update({
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
