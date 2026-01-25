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
import { SystemType, ActionType } from "@/generated/prisma/enums";
import { getRuleConfig } from "@/utils/rule/consts";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";

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

/**
 * Ensure conversation status rules exist for ThreadTracker creation
 *
 * These rules enable the conversation tracking feature which creates ThreadTrackers
 * when messages are processed. Without these rules, outbound tracking and
 * conversation status detection are disabled.
 */
export async function ensureConversationRules(
  emailAccountId: string,
): Promise<void> {
  logStep("Ensuring conversation rules exist", { emailAccountId });

  const conversationTypes = [SystemType.TO_REPLY, SystemType.AWAITING_REPLY];

  for (const systemType of conversationTypes) {
    const existingRule = await prisma.rule.findUnique({
      where: {
        emailAccountId_systemType: {
          emailAccountId,
          systemType,
        },
      },
    });

    if (existingRule) {
      // Ensure rule is enabled
      if (!existingRule.enabled) {
        await prisma.rule.update({
          where: { id: existingRule.id },
          data: { enabled: true },
        });
        logStep(`Enabled existing ${systemType} rule`);
      } else {
        logStep(`${systemType} rule already exists and is enabled`);
      }
      continue;
    }

    const ruleConfig = getRuleConfig(systemType);

    // Create the conversation rule with a LABEL action
    await prisma.rule.create({
      data: {
        emailAccountId,
        name: ruleConfig.name,
        instructions: ruleConfig.instructions,
        systemType,
        enabled: true,
        runOnThreads: ruleConfig.runOnThreads,
        actions: {
          create: {
            type: ActionType.LABEL,
            label: ruleConfig.label,
          },
        },
      },
    });

    logStep(`Created ${systemType} conversation rule`);
  }

  logStep("Conversation rules ensured");
}

/**
 * Disable non-conversation rules to avoid AI Auto-Reply interference
 *
 * This keeps conversation status rules enabled (needed for ThreadTracker creation)
 * while disabling other rules that might create drafts or interfere with assertions.
 */
export async function disableNonConversationRules(
  emailAccountId: string,
): Promise<void> {
  logStep("Disabling non-conversation rules", { emailAccountId });

  const result = await prisma.rule.updateMany({
    where: {
      emailAccountId,
      enabled: true,
      OR: [
        { systemType: null },
        { systemType: { notIn: CONVERSATION_STATUS_TYPES } },
      ],
    },
    data: { enabled: false },
  });

  logStep("Non-conversation rules disabled", { count: result.count });
}

/**
 * Re-enable all rules for an account
 */
export async function enableAllRules(emailAccountId: string): Promise<void> {
  logStep("Re-enabling all rules", { emailAccountId });

  const result = await prisma.rule.updateMany({
    where: { emailAccountId, enabled: false },
    data: { enabled: true },
  });

  logStep("Rules re-enabled", { count: result.count });
}
