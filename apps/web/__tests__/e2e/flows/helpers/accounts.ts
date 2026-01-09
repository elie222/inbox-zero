/**
 * Test account management for E2E flow tests
 *
 * Loads test accounts from the database and provides
 * helper functions for account operations.
 */

import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import { E2E_GMAIL_EMAIL, E2E_OUTLOOK_EMAIL } from "../config";
import { logStep } from "./logging";

// Logger for email provider operations
const testLogger = createScopedLogger("e2e-test");

export interface TestAccount {
  id: string;
  email: string;
  userId: string;
  provider: "google" | "microsoft";
  emailProvider: EmailProvider;
}

let gmailAccount: TestAccount | null = null;
let outlookAccount: TestAccount | null = null;

/**
 * Load Gmail test account from database
 */
export async function getGmailTestAccount(): Promise<TestAccount> {
  if (gmailAccount) {
    return gmailAccount;
  }

  if (!E2E_GMAIL_EMAIL) {
    throw new Error("E2E_GMAIL_EMAIL environment variable is not set");
  }

  logStep("Loading Gmail test account", { email: E2E_GMAIL_EMAIL });

  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      email: E2E_GMAIL_EMAIL,
      account: {
        provider: "google",
      },
    },
    include: {
      account: true,
    },
  });

  if (!emailAccount) {
    throw new Error(
      `No Gmail account found for ${E2E_GMAIL_EMAIL}. ` +
        "Make sure the account is logged in and stored in the test database.",
    );
  }

  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: "google",
    logger: testLogger,
  });

  gmailAccount = {
    id: emailAccount.id,
    email: emailAccount.email,
    userId: emailAccount.userId,
    provider: "google",
    emailProvider,
  };

  logStep("Gmail test account loaded", {
    id: gmailAccount.id,
    email: gmailAccount.email,
  });

  return gmailAccount;
}

/**
 * Load Outlook test account from database
 */
export async function getOutlookTestAccount(): Promise<TestAccount> {
  if (outlookAccount) {
    return outlookAccount;
  }

  if (!E2E_OUTLOOK_EMAIL) {
    throw new Error("E2E_OUTLOOK_EMAIL environment variable is not set");
  }

  logStep("Loading Outlook test account", { email: E2E_OUTLOOK_EMAIL });

  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      email: E2E_OUTLOOK_EMAIL,
      account: {
        provider: "microsoft",
      },
    },
    include: {
      account: true,
    },
  });

  if (!emailAccount) {
    throw new Error(
      `No Outlook account found for ${E2E_OUTLOOK_EMAIL}. ` +
        "Make sure the account is logged in and stored in the test database.",
    );
  }

  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: "microsoft",
    logger: testLogger,
  });

  outlookAccount = {
    id: emailAccount.id,
    email: emailAccount.email,
    userId: emailAccount.userId,
    provider: "microsoft",
    emailProvider,
  };

  logStep("Outlook test account loaded", {
    id: outlookAccount.id,
    email: outlookAccount.email,
  });

  return outlookAccount;
}

/**
 * Get both test accounts
 */
export async function getTestAccounts(): Promise<{
  gmail: TestAccount;
  outlook: TestAccount;
}> {
  const [gmail, outlook] = await Promise.all([
    getGmailTestAccount(),
    getOutlookTestAccount(),
  ]);
  return { gmail, outlook };
}

/**
 * Ensure test account has premium status for AI features
 *
 * Uses the app's existing premium upgrade logic to ensure consistency
 * with how real users get upgraded.
 */
export async function ensureTestPremium(userId: string): Promise<void> {
  logStep("Ensuring premium status", { userId });

  // Import dynamically to avoid circular dependency issues
  const { upgradeToPremiumLemon } = await import("@/utils/premium/server");
  const { PremiumTier } = await import("@/generated/prisma/enums");

  // Clear any existing aiApiKey to use env defaults
  await prisma.user.update({
    where: { id: userId },
    data: { aiApiKey: null },
  });

  // Use the app's upgrade function with a far-future expiration date for testing
  const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

  await upgradeToPremiumLemon({
    userId,
    tier: PremiumTier.BUSINESS_PLUS_MONTHLY,
    lemonSqueezyRenewsAt: new Date(Date.now() + TEN_YEARS_MS),
    // These fields are null since this is a test upgrade, not a real subscription
    lemonSqueezySubscriptionId: null,
    lemonSqueezySubscriptionItemId: null,
    lemonSqueezyOrderId: null,
    lemonSqueezyCustomerId: null,
    lemonSqueezyProductId: null,
    lemonSqueezyVariantId: null,
  });

  logStep("Premium status ensured");
}

/**
 * Ensure test account has at least one rule for AI processing
 */
export async function ensureTestRules(emailAccountId: string): Promise<void> {
  logStep("Ensuring test rules exist", { emailAccountId });

  const existingRules = await prisma.rule.findMany({
    where: { emailAccountId, enabled: true },
  });

  if (existingRules.length > 0) {
    logStep("Rules already exist", { count: existingRules.length });
    return;
  }

  // Create a default rule that uses AI to draft replies
  logStep("Creating default test rule");

  await prisma.rule.create({
    data: {
      name: "AI Auto-Reply",
      emailAccountId,
      enabled: true,
      runOnThreads: false,
      instructions:
        "If this email requires a response, draft a helpful reply. " +
        "If it's just informational (FYI, newsletter, notification), do nothing.",
      actions: {
        create: {
          type: "DRAFT_EMAIL",
        },
      },
    },
  });

  logStep("Default test rule created");
}

/**
 * Clear cached accounts (useful for test isolation)
 */
export function clearAccountCache(): void {
  gmailAccount = null;
  outlookAccount = null;
}
