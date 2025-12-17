/**
 * Shared helpers for E2E tests
 */

import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";

export async function findOldMessage(
  provider: EmailProvider,
  daysOld = 7,
): Promise<{ threadId: string; messageId: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const response = await provider.getMessagesWithPagination({
    maxResults: 1,
    before: cutoffDate,
  });

  const message = response.messages[0];
  if (!message?.id || !message?.threadId) {
    throw new Error("No old message found for testing");
  }

  return {
    threadId: message.threadId,
    messageId: message.id,
  };
}

/**
 * Ensures the user has premium status for testing AI features.
 * Creates or updates premium to BUSINESS_MONTHLY with active subscription.
 * Also clears any custom aiApiKey to use env defaults.
 */
export async function ensureTestPremiumAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { premium: true },
  });

  // Clear any existing aiApiKey to use env defaults
  await prisma.user.update({
    where: { id: user.id },
    data: { aiApiKey: null },
  });

  if (!user.premium) {
    const premium = await prisma.premium.create({
      data: {
        tier: "BUSINESS_MONTHLY",
        stripeSubscriptionStatus: "active",
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { premiumId: premium.id },
    });
  } else {
    await prisma.premium.update({
      where: { id: user.premium.id },
      data: {
        stripeSubscriptionStatus: "active",
        tier: "BUSINESS_MONTHLY",
      },
    });
  }
}

/**
 * Ensures the email account has at least one enabled rule for automation testing.
 * Creates a catch-all test rule with DRAFT_EMAIL action if none exists.
 *
 * Note: This creates a rule that matches ALL emails - use only in test accounts!
 */
export async function ensureCatchAllTestRule(
  emailAccountId: string,
): Promise<void> {
  const existingRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      enabled: true,
      name: "E2E Test Catch-All Rule",
    },
  });

  if (!existingRule) {
    await prisma.rule.create({
      data: {
        name: "E2E Test Catch-All Rule",
        emailAccountId,
        enabled: true,
        automate: true,
        instructions:
          "This is a test rule that should match all emails. Draft a brief acknowledgment reply.",
        actions: {
          create: {
            type: "DRAFT_EMAIL",
            content: "Test acknowledgment",
          },
        },
      },
    });
  }
}
