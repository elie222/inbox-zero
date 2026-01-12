/**
 * E2E Flow Test: Full Reply Cycle
 *
 * Tests the complete email processing flow:
 * 1. Gmail sends email to Outlook
 * 2. Outlook webhook fires
 * 3. Rule processes and creates draft
 * 4. Draft is sent as reply
 * 5. Gmail receives the reply
 * 6. Outbound handling cleans up drafts
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e full-reply-cycle
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { shouldRunFlowTests, TIMEOUTS } from "./config";
import { initializeFlowTests, setupFlowTest } from "./setup";
import { generateTestSummary } from "./teardown";
import {
  sendTestEmail,
  sendTestReply,
  TEST_EMAIL_SCENARIOS,
  assertDraftExists,
} from "./helpers/email";
import {
  waitForExecutedRule,
  waitForMessageInInbox,
  waitForDraftDeleted,
  waitForDraftSendLog,
} from "./helpers/polling";
import { logStep, clearLogs, setTestStartTime } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";

describe.skipIf(!shouldRunFlowTests())("Full Reply Cycle", () => {
  let gmail: TestAccount;
  let outlook: TestAccount;
  let testStartTime: number;

  beforeAll(async () => {
    await initializeFlowTests();
    const accounts = await setupFlowTest();
    gmail = accounts.gmail;
    outlook = accounts.outlook;
  }, TIMEOUTS.TEST_DEFAULT);

  afterAll(async () => {
    // Note: We intentionally don't call teardownFlowTests() here
    // to keep webhook subscriptions active for subsequent runs
  });

  afterEach(async () => {
    generateTestSummary("Full Reply Cycle", testStartTime);
    clearLogs();
  });

  test(
    "Gmail sends to Outlook, rule creates draft, user sends reply, Gmail receives",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Step 1: Gmail sends email to Outlook
      // ========================================
      logStep("Step 1: Sending email from Gmail to Outlook");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      logStep("Email sent", {
        messageId: sentEmail.messageId,
        threadId: sentEmail.threadId,
        subject: sentEmail.fullSubject,
      });

      // ========================================
      // Step 2: Wait for Outlook to receive and process
      // ========================================
      logStep("Step 2: Waiting for Outlook to receive email");

      // Wait for message to appear in Outlook inbox - use fullSubject for unique match
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
      // Step 3: Wait for rule execution
      // ========================================
      logStep("Step 3: Waiting for rule execution", {
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
        ruleId: executedRule.ruleId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      // ========================================
      // Step 4: Verify draft was created
      // ========================================
      logStep("Step 4: Verifying draft creation");

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );

      expect(draftAction).toBeDefined();
      expect(draftAction?.draftId).toBeTruthy();

      // Verify draft exists in Outlook
      const draftInfo = await assertDraftExists({
        provider: outlook.emailProvider,
        threadId: outlookMessage.threadId,
      });

      logStep("Draft created", {
        draftId: draftInfo.draftId,
        contentPreview: draftInfo.content?.substring(0, 100),
      });

      // ========================================
      // Step 5: Check that appropriate label was applied
      // ========================================
      logStep("Step 5: Verifying label applied");

      // Check if any of the expected labels were applied
      const labelAction = executedRule.actionItems.find(
        (a) => a.type === "LABEL" && a.labelId,
      );

      if (labelAction?.labelId) {
        const message = await outlook.emailProvider.getMessage(
          outlookMessage.messageId,
        );
        expect(message.labelIds).toBeDefined();
        expect(message.labelIds).toContain(labelAction.labelId);
        logStep("Labels on message", { labels: message.labelIds });
      }

      // ========================================
      // Step 6: Send the draft reply
      // ========================================
      logStep("Step 6: Sending draft reply from Outlook");

      // Get the draft content
      const draft = await outlook.emailProvider.getDraft(draftInfo.draftId);
      expect(draft).toBeDefined();

      // Send a reply (simulating user sending the draft)
      const replyResult = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: outlookMessage.threadId,
        originalMessageId: outlookMessage.messageId,
        body:
          draft?.textPlain ||
          "Thank you for your email. Here is the information you requested.",
      });

      logStep("Reply sent from Outlook", {
        messageId: replyResult.messageId,
        threadId: replyResult.threadId,
      });

      // ========================================
      // Step 7: Verify Gmail receives the reply
      // ========================================
      logStep("Step 7: Waiting for Gmail to receive reply");

      const gmailReply = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Reply received in Gmail", {
        messageId: gmailReply.messageId,
        threadId: gmailReply.threadId,
      });

      // Verify it's in the same thread
      expect(gmailReply.threadId).toBe(sentEmail.threadId);

      // ========================================
      // Step 8: Verify outbound handling
      // ========================================
      logStep("Step 8: Verifying outbound handling");

      // Wait for DraftSendLog to be recorded
      const draftSendLog = await waitForDraftSendLog({
        threadId: outlookMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(draftSendLog).toBeDefined();
      logStep("DraftSendLog recorded", {
        id: draftSendLog.id,
        wasSentFromDraft: draftSendLog.wasSentFromDraft,
      });

      // ========================================
      // Step 9: Verify draft cleanup
      // ========================================
      logStep("Step 9: Verifying draft cleanup");

      // The AI draft should have been deleted since user sent their own reply
      // or used the draft
      await waitForDraftDeleted({
        draftId: draftInfo.draftId,
        provider: outlook.emailProvider,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("Draft cleanup verified - draft deleted");

      // ========================================
      // Test Complete
      // ========================================
      logStep("=== Full Reply Cycle Test PASSED ===");
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should verify thread continuity across providers",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();

      // ========================================
      // Send initial email
      // ========================================
      logStep("Sending initial email from Gmail to Outlook");

      const initialEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: "Thread continuity test",
        body: "This is the first message in the thread.",
      });

      // Wait for Outlook to receive - use fullSubject for unique match
      const outlookMsg1 = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      // ========================================
      // Send reply from Outlook
      // ========================================
      logStep("Sending reply from Outlook to Gmail");

      await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: outlookMsg1.threadId,
        originalMessageId: outlookMsg1.messageId,
        body: "This is the reply from Outlook.",
      });

      // Wait for Gmail to receive - use fullSubject for unique match
      const gmailReply = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      // Verify same thread on Gmail side
      expect(gmailReply.threadId).toBe(initialEmail.threadId);

      // ========================================
      // Send another reply from Gmail
      // ========================================
      logStep("Sending second reply from Gmail to Outlook");

      await sendTestReply({
        from: gmail,
        to: outlook,
        threadId: gmailReply.threadId,
        originalMessageId: gmailReply.messageId,
        body: "This is the second reply from Gmail.",
      });

      // Wait for Outlook to receive - use fullSubject for unique match
      const outlookMsg2 = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      // Verify same thread on Outlook side
      expect(outlookMsg2.threadId).toBe(outlookMsg1.threadId);

      logStep("Thread continuity verified across 3 messages");
    },
    TIMEOUTS.FULL_CYCLE,
  );
});
