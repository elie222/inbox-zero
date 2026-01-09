/**
 * Global setup for E2E flow tests
 *
 * This file is run once before all flow tests.
 * It sets up webhook subscriptions and validates configuration.
 */

import { vi } from "vitest";
import {
  validateConfig,
  E2E_RUN_ID,
  E2E_GMAIL_EMAIL,
  E2E_OUTLOOK_EMAIL,
} from "./config";
import {
  getGmailTestAccount,
  getOutlookTestAccount,
  ensureTestPremium,
  ensureTestRules,
} from "./helpers/accounts";
import { ensureWebhookSubscription } from "./helpers/webhook";
import { logStep } from "./helpers/logging";

// Mock server-only module (Next.js specific)
vi.mock("server-only", () => ({}));

// Mock message processing lock to always succeed
vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));

// Mock Next.js after() to run immediately in tests
// This ensures webhook processing completes before assertions
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: async (fn: () => void | Promise<void>) => {
      // Run the async function and wait for it
      await fn();
    },
  };
});

/**
 * Initialize test environment
 *
 * Call this in beforeAll of your test suites
 */
export async function initializeFlowTests(): Promise<void> {
  logStep("=== E2E Flow Tests Initialization ===");
  logStep("Run ID", { runId: E2E_RUN_ID });

  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    throw new Error(
      `Invalid E2E test configuration:\n${configValidation.errors.join("\n")}`,
    );
  }

  logStep("Configuration validated", {
    gmailEmail: E2E_GMAIL_EMAIL,
    outlookEmail: E2E_OUTLOOK_EMAIL,
  });

  // Load test accounts
  const gmail = await getGmailTestAccount();
  const outlook = await getOutlookTestAccount();

  // Ensure premium status for AI features
  await ensureTestPremium(gmail.userId);
  await ensureTestPremium(outlook.userId);

  // Ensure rules exist for AI processing
  await ensureTestRules(gmail.id);
  await ensureTestRules(outlook.id);

  // Set up webhook subscriptions
  await ensureWebhookSubscription(gmail);
  await ensureWebhookSubscription(outlook);

  logStep("=== Initialization Complete ===");
}

/**
 * Setup for individual test files
 *
 * Returns the test accounts ready for use
 */
export async function setupFlowTest(): Promise<{
  gmail: Awaited<ReturnType<typeof getGmailTestAccount>>;
  outlook: Awaited<ReturnType<typeof getOutlookTestAccount>>;
}> {
  const gmail = await getGmailTestAccount();
  const outlook = await getOutlookTestAccount();

  return { gmail, outlook };
}
