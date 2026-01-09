/**
 * Global teardown for E2E flow tests
 *
 * This file provides cleanup functions for flow tests.
 */

import { getTestSubjectPrefix } from "./config";
import {
  getGmailTestAccount,
  getOutlookTestAccount,
  clearAccountCache,
} from "./helpers/accounts";
import { cleanupTestEmails } from "./helpers/email";
import {
  clearLogs,
  logStep,
  logTestSummary,
  getWebhookLog,
  getApiCallLog,
} from "./helpers/logging";

/**
 * Clean up test artifacts after a test run
 *
 * Options:
 * - keepOnFailure: If true, skip cleanup when test failed (for debugging)
 */
export async function cleanupFlowTest(options: {
  testPassed: boolean;
  keepOnFailure?: boolean;
}): Promise<void> {
  const { testPassed, keepOnFailure = true } = options;

  if (!testPassed && keepOnFailure) {
    logStep("Skipping cleanup - test failed and keepOnFailure is enabled");
    return;
  }

  logStep("Cleaning up test artifacts");

  try {
    const gmail = await getGmailTestAccount();
    const outlook = await getOutlookTestAccount();

    const prefix = getTestSubjectPrefix();

    // Clean up test emails in both accounts
    await Promise.all([
      cleanupTestEmails({
        provider: gmail.emailProvider,
        subjectPrefix: prefix,
        markAsRead: true,
      }),
      cleanupTestEmails({
        provider: outlook.emailProvider,
        subjectPrefix: prefix,
        markAsRead: true,
      }),
    ]);

    logStep("Cleanup complete");
  } catch (error) {
    // Log but don't throw - cleanup is best effort
    logStep("Error during cleanup", { error: String(error) });
  }
}

/**
 * Full teardown - call when completely done with all tests
 */
export async function teardownFlowTests(): Promise<void> {
  logStep("=== E2E Flow Tests Teardown ===");

  try {
    // Load accounts to ensure they're initialized before cleanup
    // (needed if we want to add webhook teardown later)
    await getGmailTestAccount();
    await getOutlookTestAccount();

    // Clear account cache
    clearAccountCache();

    // Clear logs
    clearLogs();

    logStep("=== Teardown Complete ===");
  } catch (error) {
    logStep("Error during teardown", { error: String(error) });
  }
}

/**
 * Generate test summary with timing and stats
 */
export function generateTestSummary(
  testName: string,
  startTime: number,
  error?: Error,
): void {
  const duration = Date.now() - startTime;
  const webhooks = getWebhookLog();
  const apiCalls = getApiCallLog();

  logTestSummary(testName, {
    passed: !error,
    duration,
    webhooksReceived: webhooks.length,
    apiCalls: apiCalls.length,
    error: error?.message,
  });
}
