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
  waitForNoThreadDrafts,
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

      // Wait for all thread drafts to clear (including async Microsoft processing)
      // Microsoft's createReply API creates temporary drafts that may briefly remain
      // while being processed for sending
      await waitForNoThreadDrafts({
        threadId: firstReceived.threadId,
        provider: outlook.emailProvider,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("All thread drafts cleared");
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

  test(
    "should NOT delete user-created drafts",
    async () => {
      testStartTime = Date.now();
      const scenario = TEST_EMAIL_SCENARIOS.QUESTION;

      // ========================================
      // Step 1: Send email and wait for AI draft
      // ========================================
      logStep("Sending email and waiting for AI draft");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      const received = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      const executedRule = await waitForExecutedRule({
        threadId: received.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      const aiDraftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );
      expect(aiDraftAction?.draftId).toBeTruthy();
      const aiDraftId = aiDraftAction!.draftId!;
      logStep("AI draft created", { aiDraftId });

      // ========================================
      // Step 2: Create a user draft manually (not tracked by our system)
      // ========================================
      logStep("Creating user draft manually");

      const userDraft = await outlook.emailProvider.createDraft({
        to: gmail.email,
        subject: `Re: ${sentEmail.fullSubject}`,
        messageHtml: "<p>This is my manual draft that I created myself</p>",
        replyToMessageId: received.messageId,
      });
      const userDraftId = userDraft.id;
      logStep("User draft created", { userDraftId });

      // ========================================
      // Step 3: User sends a different reply (triggers cleanup)
      // ========================================
      logStep("User sends a different reply");

      await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: received.threadId,
        originalMessageId: received.messageId,
        body: "Here is my actual reply, not from any draft.",
      });

      // ========================================
      // Step 4: Wait for AI draft to be cleaned up
      // ========================================
      logStep("Waiting for AI draft to be cleaned up");

      await waitForDraftDeleted({
        draftId: aiDraftId,
        provider: outlook.emailProvider,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });
      logStep("AI draft deleted");

      // ========================================
      // Step 5: Verify user draft still exists
      // ========================================
      logStep("Verifying user draft still exists");

      const userDraftAfter = await outlook.emailProvider.getDraft(userDraftId);
      expect(userDraftAfter).not.toBeNull();
      logStep("User draft preserved", {
        userDraftId,
        exists: !!userDraftAfter,
      });

      // Cleanup: delete the user draft
      await outlook.emailProvider.deleteDraft(userDraftId);
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should NOT delete edited AI drafts",
    async () => {
      testStartTime = Date.now();
      const scenario = TEST_EMAIL_SCENARIOS.QUESTION;

      // ========================================
      // Step 1: Send email and wait for AI draft
      // ========================================
      logStep("Sending email and waiting for AI draft");

      const sentEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      const received = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: sentEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      const executedRule = await waitForExecutedRule({
        threadId: received.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      const aiDraftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );
      expect(aiDraftAction?.draftId).toBeTruthy();
      const aiDraftId = aiDraftAction!.draftId!;
      logStep("AI draft created", { aiDraftId });

      // ========================================
      // Step 2: User edits the AI draft
      // ========================================
      logStep("User edits the AI draft");

      await outlook.emailProvider.updateDraft(aiDraftId, {
        messageHtml:
          "<p>I significantly edited this draft with my own content that is completely different.</p>",
      });
      logStep("AI draft edited by user");

      // ========================================
      // Step 3: User sends a DIFFERENT reply (triggers cleanup)
      // ========================================
      logStep("User sends a different reply");

      await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: received.threadId,
        originalMessageId: received.messageId,
        body: "Here is my actual reply, not using the draft.",
      });

      // ========================================
      // Step 4: Wait for cleanup to process
      // ========================================
      // When the user sends a reply, the webhook fires and triggers cleanup.
      // Since we're testing a negative (draft should NOT be deleted because
      // similarity != 1.0), we wait for the sent message to be processed.
      // Use waitForDraftSendLog as it indicates the outbound flow has completed.
      logStep("Waiting for outbound processing to complete");
      await waitForDraftSendLog({
        threadId: received.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      // ========================================
      // Step 5: Verify edited draft still exists (similarity != 1.0)
      // ========================================
      logStep("Verifying edited AI draft still exists");

      const editedDraft = await outlook.emailProvider.getDraft(aiDraftId);
      expect(editedDraft).not.toBeNull();
      logStep("Edited AI draft preserved", {
        aiDraftId,
        exists: !!editedDraft,
      });

      // Cleanup: delete the edited draft
      await outlook.emailProvider.deleteDraft(aiDraftId);
    },
    TIMEOUTS.FULL_CYCLE,
  );
});
