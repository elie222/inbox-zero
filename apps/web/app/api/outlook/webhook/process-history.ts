import { NextResponse } from "next/server";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import prisma from "@/utils/prisma";
import { hasAiAccess, isPremium } from "@/utils/premium";
import { ColdEmailSetting } from "@prisma/client";
import { captureException } from "@/utils/error";
import { unwatchEmails } from "@/app/api/watch/controller";
import { createEmailProvider } from "@/utils/email/provider";
import type {
  ProcessHistoryOptions,
  OutlookResourceData,
} from "@/app/api/outlook/webhook/types";
import { processHistoryItem } from "@/app/api/outlook/webhook/process-history-item";
import { logger } from "@/app/api/outlook/webhook/logger";

export async function processHistoryForUser({
  subscriptionId,
  resourceData,
}: {
  subscriptionId: string;
  resourceData: OutlookResourceData;
}) {
  const emailAccount = await prisma.emailAccount.findFirst({
    where: { watchEmailsSubscriptionId: subscriptionId },
    select: {
      id: true,
      email: true,
      userId: true,
      about: true,
      coldEmailBlocker: true,
      coldEmailPrompt: true,
      autoCategorizeSenders: true,
      account: {
        select: {
          provider: true,
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
    logger.error("Account not found", { subscriptionId });
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
      email: emailAccount.email,
      lemonSqueezyRenewsAt: emailAccount.user.premium?.lemonSqueezyRenewsAt,
      stripeSubscriptionStatus:
        emailAccount.user.premium?.stripeSubscriptionStatus,
    });
    const provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account?.provider || "microsoft-entra-id",
    });
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      provider,
      subscriptionId,
    });
    return NextResponse.json({ ok: true });
  }

  const userHasAiAccess = hasAiAccess(premium.tier, emailAccount.user.aiApiKey);

  if (!userHasAiAccess) {
    logger.trace("Does not have ai access", { email: emailAccount.email });
    const provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account?.provider || "microsoft-entra-id",
    });
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      provider,
      subscriptionId,
    });
    return NextResponse.json({ ok: true });
  }

  const hasAutomationRules = emailAccount.rules.length > 0;
  const shouldBlockColdEmails =
    emailAccount.coldEmailBlocker &&
    emailAccount.coldEmailBlocker !== ColdEmailSetting.DISABLED;
  if (!hasAutomationRules && !shouldBlockColdEmails) {
    logger.trace("Has no rules set and cold email blocker disabled", {
      email: emailAccount.email,
    });
    return NextResponse.json({ ok: true });
  }

  if (
    !emailAccount.account?.access_token ||
    !emailAccount.account?.refresh_token
  ) {
    logger.error("Missing access or refresh token", {
      email: emailAccount.email,
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const outlookClient = await getOutlookClientWithRefresh({
      accessToken: emailAccount.account?.access_token,
      refreshToken: emailAccount.account?.refresh_token,
      expiresAt: emailAccount.account?.expires_at,
      emailAccountId: emailAccount.id,
    });

    await processHistoryItem(resourceData, {
      client: outlookClient.getClient(),
      accessToken: emailAccount.account.access_token,
      hasAutomationRules,
      hasAiAccess: userHasAiAccess,
      rules: emailAccount.rules,
      emailAccount,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Invalid grant", { email: emailAccount.email });
      return NextResponse.json({ ok: true });
    }

    captureException(
      error,
      { extra: { subscriptionId, resourceData } },
      emailAccount.email,
    );
    logger.error("Error processing webhook", {
      subscriptionId,
      resourceData,
      email: emailAccount.email,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });
    // returning 200 here, as otherwise Microsoft will keep retrying
    return NextResponse.json({ error: true });
  }
}
