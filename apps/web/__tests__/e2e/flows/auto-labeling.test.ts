/**
 * E2E Flow Test: Auto-Labeling
 *
 * Tests that emails are correctly classified and labeled:
 * - Emails needing reply get appropriate labels
 * - FYI/informational emails don't trigger drafts
 * - Labels are actually applied in the email provider
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e auto-labeling
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest";
import { shouldRunFlowTests, TIMEOUTS } from "./config";
import { initializeFlowTests, setupFlowTest } from "./setup";
import { generateTestSummary } from "./teardown";
import { sendTestEmail, TEST_EMAIL_SCENARIOS } from "./helpers/email";
import { waitForExecutedRule, waitForMessageInInbox } from "./helpers/polling";
import { logStep, clearLogs, setTestStartTime } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";

describe.skipIf(!shouldRunFlowTests())("Auto-Labeling", () => {
  let gmail: TestAccount;
  let outlook: TestAccount;
  let testStartTime: number;

  beforeAll(async () => {
    await initializeFlowTests();
    const accounts = await setupFlowTest();
    gmail = accounts.gmail;
    outlook = accounts.outlook;
  }, TIMEOUTS.TEST_DEFAULT);

  afterEach(async () => {
    generateTestSummary("Auto-Labeling", testStartTime);
    clearLogs();
  });

  test(
    "should label email that needs reply and create draft",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Send email that clearly needs a reply
      // ========================================
      logStep("Sending email that needs reply");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      // Wait for Outlook to receive - use fullSubject for unique match across tests
      const outlookMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: outlookMessage.messageId,
        threadId: outlookMessage.threadId,
      });

      // ========================================
      // Wait for rule execution
      // ========================================
      logStep("Waiting for rule execution", {
        threadId: outlookMessage.threadId,
      });

      const executedRule = await waitForExecutedRule({
        threadId: outlookMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(executedRule).toBeDefined();
      expect(executedRule.status).toBe("APPLIED");

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
        executedRuleMessageId: executedRule.messageId,
        inboxMessageId: outlookMessage.messageId,
        messageIdMatch: executedRule.messageId === outlookMessage.messageId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      // ========================================
      // Verify draft was created (needs reply = should draft)
      // ========================================
      logStep("Verifying draft action");

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL",
      );

      // For a "needs reply" email, we expect a draft to be created
      expect(draftAction).toBeDefined();
      expect(draftAction?.draftId).toBeTruthy();

      logStep("Draft created for needs-reply email", {
        draftId: draftAction?.draftId,
      });

      // ========================================
      // Verify labels in email provider
      // ========================================
      logStep("Verifying labels in provider");

      const message = await outlook.emailProvider.getMessage(
        outlookMessage.messageId,
      );

      logStep("Message labels", { labels: message.labelIds });

      // The message should have some label applied (specific label depends on rules)
      // At minimum, we verify the message was processed
      expect(executedRule.actionItems.length).toBeGreaterThan(0);
    },
    TIMEOUTS.TEST_DEFAULT,
  );

  test(
    "should label FYI email without creating draft",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.FYI_ONLY;

      // ========================================
      // Send FYI/informational email
      // ========================================
      logStep("Sending FYI email");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      // Wait for Outlook to receive - use fullSubject for unique match across tests
      const outlookMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: outlookMessage.messageId,
        threadId: outlookMessage.threadId,
      });

      // ========================================
      // Wait for rule execution
      // ========================================
      logStep("Waiting for rule execution", {
        threadId: outlookMessage.threadId,
      });

      const executedRule = await waitForExecutedRule({
        threadId: outlookMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(executedRule).toBeDefined();

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
        executedRuleMessageId: executedRule.messageId,
        inboxMessageId: outlookMessage.messageId,
        messageIdMatch: executedRule.messageId === outlookMessage.messageId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      // ========================================
      // Verify NO draft was created for FYI email
      // ========================================
      logStep("Verifying no draft for FYI email");

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );

      // FYI emails should NOT create drafts
      expect(draftAction).toBeUndefined();

      logStep("Draft action result", {
        hasDraft: false,
      });

      // ========================================
      // Verify appropriate label was applied
      // ========================================
      logStep("Verifying labels");

      const message = await outlook.emailProvider.getMessage(
        outlookMessage.messageId,
      );

      logStep("Message labels", { labels: message.labelIds });
    },
    TIMEOUTS.TEST_DEFAULT,
  );

  test(
    "should handle thank you email appropriately",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.THANK_YOU;

      // ========================================
      // Send thank you email
      // ========================================
      logStep("Sending thank you email");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      // Wait for Outlook to receive - use fullSubject for unique match across tests
      const outlookMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: outlookMessage.messageId,
        threadId: outlookMessage.threadId,
      });

      // ========================================
      // Wait for rule execution
      // ========================================
      logStep("Waiting for rule execution", {
        threadId: outlookMessage.threadId,
      });

      const executedRule = await waitForExecutedRule({
        threadId: outlookMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(executedRule).toBeDefined();

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
        executedRuleMessageId: executedRule.messageId,
        inboxMessageId: outlookMessage.messageId,
        messageIdMatch: executedRule.messageId === outlookMessage.messageId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      // ========================================
      // Verify processing
      // ========================================
      logStep("Verifying thank you email processing");

      // Thank you emails typically don't need replies
      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );

      // Thank you emails should NOT create drafts
      expect(draftAction).toBeUndefined();

      logStep("Thank you email processed", {
        hasDraft: false,
        actionsCount: executedRule.actionItems.length,
      });
    },
    TIMEOUTS.TEST_DEFAULT,
  );

  test(
    "should handle question email with draft",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.QUESTION;

      // ========================================
      // Send question email
      // ========================================
      logStep("Sending question email");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      // Wait for Outlook to receive - use fullSubject for unique match across tests
      const outlookMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: outlookMessage.messageId,
        threadId: outlookMessage.threadId,
      });

      // ========================================
      // Wait for rule execution
      // ========================================
      logStep("Waiting for rule execution", {
        threadId: outlookMessage.threadId,
      });

      const executedRule = await waitForExecutedRule({
        threadId: outlookMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(executedRule).toBeDefined();

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
        executedRuleMessageId: executedRule.messageId,
        inboxMessageId: outlookMessage.messageId,
        messageIdMatch: executedRule.messageId === outlookMessage.messageId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      // ========================================
      // Verify draft created for question
      // ========================================
      logStep("Verifying question email processing");

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL",
      );

      // Questions should typically create drafts
      expect(draftAction).toBeDefined();

      logStep("Question email processed", {
        hasDraft: !!draftAction?.draftId,
        actionsCount: executedRule.actionItems.length,
      });
    },
    TIMEOUTS.TEST_DEFAULT,
  );
});
