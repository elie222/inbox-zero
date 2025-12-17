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

  // Get messages from INBOX to ensure they have proper folder labels for processing
  const inboxMessages = await provider.getInboxMessages(20);

  // First try to find an old message (preferred to avoid interfering with recent activity)
  let selectedMessage = inboxMessages.find((msg) => {
    const messageDate = msg.headers.date ? new Date(msg.headers.date) : null;
    return messageDate && messageDate < cutoffDate;
  });

  // If no old message found, fall back to any inbox message (pick the oldest available)
  if (!selectedMessage && inboxMessages.length > 0) {
    // Sort by date ascending (oldest first) and pick the oldest
    const sortedByDate = [...inboxMessages].sort((a, b) => {
      const dateA = a.headers.date ? new Date(a.headers.date).getTime() : 0;
      const dateB = b.headers.date ? new Date(b.headers.date).getTime() : 0;
      return dateA - dateB;
    });
    selectedMessage = sortedByDate[0];
  }

  if (!selectedMessage?.id || !selectedMessage?.threadId) {
    throw new Error("No message found in inbox for testing");
  }

  return {
    threadId: selectedMessage.threadId,
    messageId: selectedMessage.id,
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
