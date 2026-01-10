/**
 * E2E Flow Test: Draft Cleanup
 *
 * Tests that AI-generated drafts are properly cleaned up:
 * - When user sends their own reply (not the AI draft)
 * - When user sends the AI draft
 * - DraftSendLog is properly recorded
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e draft-cleanup
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest";
import { shouldRunFlowTests, TIMEOUTS } from "./config";
import { initializeFlowTests, setupFlowTest } from "./setup";
import { generateTestSummary } from "./teardown";
import {
  sendTestEmail,
  sendTestReply,
  TEST_EMAIL_SCENARIOS,
} from "./helpers/email";
import {
  waitForExecutedRule,
  waitForMessageInInbox,
  waitForDraftDeleted,
  waitForDraftSendLog,
} from "./helpers/polling";
import { logStep, clearLogs } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";

describe.skipIf(!shouldRunFlowTests())("Draft Cleanup", () => {
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
    generateTestSummary("Draft Cleanup", testStartTime);
    clearLogs();
  });

  test(
    "should delete AI draft when user sends manual reply",
    async () => {
      testStartTime = Date.now();
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Step 1: Send email that triggers draft creation
      // ========================================
      logStep("Step 1: Sending email that needs reply");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      const receivedMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: receivedMessage.messageId,
        threadId: receivedMessage.threadId,
      });

      // ========================================
      // Step 2: Wait for AI draft to be created
      // ========================================
      logStep("Step 2: Waiting for AI draft creation", {
        threadId: receivedMessage.threadId,
      });

      const executedRule = await waitForExecutedRule({
        threadId: receivedMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
        executedRuleMessageId: executedRule.messageId,
        inboxMessageId: receivedMessage.messageId,
        messageIdMatch: executedRule.messageId === receivedMessage.messageId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );

      expect(draftAction).toBeDefined();
      expect(draftAction?.draftId).toBeTruthy();
      const aiDraftId = draftAction!.draftId!;

      logStep("AI draft created", { draftId: aiDraftId });

      // Verify draft exists
      const aiDraft = await outlook.emailProvider.getDraft(aiDraftId);
      expect(aiDraft).toBeDefined();

      // ========================================
      // Step 3: User sends their own reply (NOT the AI draft)
      // ========================================
      logStep("Step 3: User sends manual reply (not the AI draft)");

      // Send a different reply than the AI draft
      const manualReply = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: receivedMessage.threadId,
        originalMessageId: receivedMessage.messageId,
        body: "This is my own manually written response, not the AI draft.",
      });

      logStep("Manual reply sent", {
        messageId: manualReply.messageId,
        threadId: manualReply.threadId,
      });

      // ========================================
      // Step 4: Verify AI draft is deleted
      // ========================================
      logStep("Step 4: Verifying AI draft is deleted");

      await waitForDraftDeleted({
        draftId: aiDraftId,
        provider: outlook.emailProvider,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("AI draft successfully deleted");

      // ========================================
      // Step 5: Verify DraftSendLog records the event
      // ========================================
      logStep("Step 5: Verifying DraftSendLog");

      const draftSendLog = await waitForDraftSendLog({
        threadId: receivedMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(draftSendLog).toBeDefined();

      // When user sends a different reply (not the AI draft), similarity score should be low
      expect(draftSendLog.similarityScore).toBeLessThan(0.9);

      logStep("DraftSendLog recorded", {
        similarityScore: draftSendLog.similarityScore,
        wasSentFromDraft: draftSendLog.wasSentFromDraft,
      });
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should handle multiple drafts in same thread",
    async () => {
      testStartTime = Date.now();

      // ========================================
      // Setup: Create thread with multiple incoming emails
      // ========================================
      logStep("Setting up thread with multiple messages");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: "Multi-draft cleanup test",
        body: "First question: What is the project timeline?",
      });

      const firstReceived = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: firstReceived.messageId,
        threadId: firstReceived.threadId,
      });

      // Wait for first draft
      logStep("Waiting for rule execution", {
        threadId: firstReceived.threadId,
      });

      const firstRule = await waitForExecutedRule({
        threadId: firstReceived.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("ExecutedRule found", {
        executedRuleId: firstRule.id,
        executedRuleMessageId: firstRule.messageId,
        inboxMessageId: firstReceived.messageId,
        messageIdMatch: firstRule.messageId === firstReceived.messageId,
        status: firstRule.status,
        actionItems: firstRule.actionItems.length,
      });

      const firstDraftAction = firstRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );

      expect(firstDraftAction?.draftId).toBeTruthy();
      const firstDraftId = firstDraftAction!.draftId!;
      logStep("First draft created", { draftId: firstDraftId });

      // ========================================
      // User sends reply
      // ========================================
      logStep("User sends reply");

      await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: firstReceived.threadId,
        originalMessageId: firstReceived.messageId,
        body: "Here is my response covering all your questions.",
      });

      // ========================================
      // Verify all drafts for thread are cleaned up
      // ========================================
      logStep("Verifying all thread drafts cleaned up");

      await waitForDraftDeleted({
        draftId: firstDraftId,
        provider: outlook.emailProvider,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });
      logStep("First draft deleted");

      // Check for any remaining drafts for this thread
      const drafts = await outlook.emailProvider.getDrafts({ maxResults: 50 });
      const threadDrafts = drafts.filter(
        (d) => d.threadId === firstReceived.threadId,
      );

      // No drafts should remain after user sends a reply
      expect(threadDrafts.length).toBe(0);

      logStep("Remaining drafts for thread", { count: threadDrafts.length });
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should record DraftSendLog when AI draft is sent",
    async () => {
      testStartTime = Date.now();
      const scenario = TEST_EMAIL_SCENARIOS.QUESTION;

      // ========================================
      // Send email and wait for draft
      // ========================================
      logStep("Sending email and waiting for draft");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      const receivedMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: receivedMessage.messageId,
        threadId: receivedMessage.threadId,
      });

      logStep("Waiting for rule execution", {
        threadId: receivedMessage.threadId,
      });

      const executedRule = await waitForExecutedRule({
        threadId: receivedMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
        executedRuleMessageId: executedRule.messageId,
        inboxMessageId: receivedMessage.messageId,
        messageIdMatch: executedRule.messageId === receivedMessage.messageId,
        status: executedRule.status,
        actionItems: executedRule.actionItems.length,
      });

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );

      expect(draftAction?.draftId).toBeTruthy();

      const aiDraftId = draftAction!.draftId!;
      logStep("AI draft created", { draftId: aiDraftId });

      // ========================================
      // Get draft content and "send" it
      // ========================================
      logStep("Fetching and sending AI draft");

      const draft = await outlook.emailProvider.getDraft(aiDraftId);
      expect(draft).toBeDefined();

      // Send the draft content as a reply
      // (simulating user clicking send on the draft)
      const sentDraft = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: receivedMessage.threadId,
        originalMessageId: receivedMessage.messageId,
        body: draft?.textPlain || "Draft content",
      });

      logStep("Draft sent", { messageId: sentDraft.messageId });

      // ========================================
      // Verify DraftSendLog
      // ========================================
      logStep("Verifying DraftSendLog records draft was sent");

      const draftSendLog = await waitForDraftSendLog({
        threadId: receivedMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(draftSendLog).toBeDefined();

      // When user sends the exact AI draft content, similarity score should be very high
      expect(draftSendLog.similarityScore).toBeGreaterThanOrEqual(0.9);

      logStep("DraftSendLog recorded", {
        id: draftSendLog.id,
        similarityScore: draftSendLog.similarityScore,
        wasSentFromDraft: draftSendLog.wasSentFromDraft,
        draftId: draftSendLog.draftId,
        sentMessageId: draftSendLog.sentMessageId,
      });
    },
    TIMEOUTS.FULL_CYCLE,
  );
});
