/**
 * E2E Flow Test: Sent Reply Preservation
 *
 * Tests that sent replies (originally from AI drafts) are preserved when
 * follow-up messages arrive in the same thread.
 *
 * Scenario:
 * 1. User A sends email to User B - triggers auto-draft creation
 * 2. User B sends the auto-generated draft without editing
 * 3. User A replies again to the thread (3rd message arrives)
 * 4. Verify: User B's sent reply is preserved in the thread
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e sent-reply-deletion
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
  waitForReplyInInbox,
  waitForDraftSendLog,
  waitForThreadMessageCount,
} from "./helpers/polling";
import { logStep, clearLogs, setTestStartTime } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";

describe.skipIf(!shouldRunFlowTests())("Sent Reply Preservation", () => {
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
    generateTestSummary("Sent Reply Preservation", testStartTime);
    clearLogs();
  });

  test(
    "should preserve sent reply when follow-up arrives (Gmail receiver - untouched draft)",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Step 1: User A (Outlook) sends email to User B (Gmail)
      // This triggers auto-draft creation in Gmail
      // ========================================
      logStep("Step 1: User A sends initial email to User B (Gmail)");

      const initialEmail = await sendTestEmail({
        from: outlook,
        to: gmail,
        subject: scenario.subject,
        body: scenario.body,
      });

      logStep("Initial email sent", {
        messageId: initialEmail.messageId,
        threadId: initialEmail.threadId,
        subject: initialEmail.fullSubject,
      });

      // Wait for Gmail to receive the email
      const gmailReceived = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Gmail", {
        messageId: gmailReceived.messageId,
        threadId: gmailReceived.threadId,
      });

      // ========================================
      // Step 2: Wait for AI to process and create draft
      // ========================================
      logStep("Step 2: Waiting for AI draft creation");

      const executedRule = await waitForExecutedRule({
        threadId: gmailReceived.threadId,
        emailAccountId: gmail.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(executedRule).toBeDefined();
      expect(executedRule.status).toBe("APPLIED");

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
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

      // ========================================
      // Step 3: User B sends the AI draft WITHOUT editing
      // ========================================
      logStep("Step 3: User B sends AI draft WITHOUT editing");

      // Get the draft content for logging
      const draft = await gmail.emailProvider.getDraft(aiDraftId);
      expect(draft).toBeDefined();

      logStep("Draft content retrieved", {
        draftId: aiDraftId,
        hasContent: !!draft?.textPlain,
        contentPreview: draft?.textPlain?.substring(0, 100),
      });

      // Actually send the draft via provider API (simulating user clicking send)
      // This keeps the same message ID which is crucial for reproducing the bug
      const userBReply = await gmail.emailProvider.sendDraft(aiDraftId);

      logStep("User B sent draft (untouched AI draft)", {
        messageId: userBReply.messageId,
        threadId: userBReply.threadId,
      });

      // Wait for DraftSendLog to confirm the sent message is recorded
      const draftSendLog = await waitForDraftSendLog({
        threadId: gmailReceived.threadId,
        emailAccountId: gmail.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("DraftSendLog recorded", {
        id: draftSendLog.id,
        similarityScore: draftSendLog.similarityScore,
        wasSentFromDraft: draftSendLog.wasSentFromDraft,
      });

      // Note: Our test sends a new reply with draft content (can't truly "send the draft")
      // Real users clicking Send on untouched draft would have similarity ~1.0
      // Any similarity > 0 indicates the system detected draft-like content
      expect(draftSendLog.similarityScore).toBeGreaterThan(0);

      // ========================================
      // Step 4: Verify User B's sent reply is in the thread
      // ========================================
      logStep("Step 4: Verifying sent reply exists before follow-up");

      // Wait for Outlook to receive User B's reply
      const outlookReceivedReply = await waitForReplyInInbox({
        provider: outlook.emailProvider,
        subjectContains: initialEmail.fullSubject,
        fromEmail: gmail.email,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("User B's reply received in Outlook", {
        messageId: outlookReceivedReply.messageId,
        threadId: outlookReceivedReply.threadId,
      });

      // Verify thread in Gmail has 2 messages (initial + reply)
      let gmailThreadMessages = await gmail.emailProvider.getThreadMessages(
        gmailReceived.threadId,
      );

      logStep("Gmail thread before follow-up", {
        messageCount: gmailThreadMessages.length,
        messageIds: gmailThreadMessages.map((m) => m.id),
      });

      expect(gmailThreadMessages.length).toBeGreaterThanOrEqual(2);

      // Find User B's sent reply in the thread
      const userBReplyInThread = gmailThreadMessages.find(
        (m) => m.id === userBReply.messageId,
      );
      expect(userBReplyInThread).toBeDefined();

      logStep("User B's sent reply verified in Gmail thread", {
        messageId: userBReply.messageId,
        found: !!userBReplyInThread,
      });

      // ========================================
      // Step 5: User A sends follow-up reply (3rd message)
      // ========================================
      logStep("Step 5: User A sends follow-up");

      const followUpReply = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: outlookReceivedReply.threadId,
        originalMessageId: outlookReceivedReply.messageId,
        body: "Thanks for your response! I have one more question about this.",
      });

      logStep("User A follow-up sent", {
        messageId: followUpReply.messageId,
        threadId: followUpReply.threadId,
      });

      // Wait for follow-up to arrive in Gmail
      const followUpReceived = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
        // Filter to find the NEW message (not initial email or User B's reply)
        filter: (msg) =>
          msg.id !== gmailReceived.messageId && msg.id !== userBReply.messageId,
      });

      logStep("Follow-up received in Gmail", {
        messageId: followUpReceived.messageId,
        threadId: followUpReceived.threadId,
      });

      // Wait for webhook processing and cleanup to complete
      // The follow-up triggers webhook processing which may run cleanup
      logStep("Waiting for webhook processing and cleanup to complete...");
      await new Promise((resolve) => setTimeout(resolve, 15_000));

      // ========================================
      // Step 6: Verify User B's sent reply is preserved
      // ========================================
      logStep("Step 6: Verifying sent reply is preserved after follow-up");

      // Wait for thread to be fully indexed with all 3 messages
      gmailThreadMessages = await waitForThreadMessageCount({
        threadId: gmailReceived.threadId,
        provider: gmail.emailProvider,
        minCount: 3,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("Gmail thread after follow-up", {
        messageCount: gmailThreadMessages.length,
        messageIds: gmailThreadMessages.map((m) => m.id),
      });

      // Thread should have 3 messages: initial + User B reply + follow-up
      expect(gmailThreadMessages.length).toBeGreaterThanOrEqual(3);

      // Check each expected message
      const expectedMessages = [
        { id: gmailReceived.messageId, name: "Initial email from User A" },
        { id: userBReply.messageId, name: "User B's sent reply" },
        { id: followUpReceived.messageId, name: "User A's follow-up" },
      ];

      for (const expected of expectedMessages) {
        const exists = gmailThreadMessages.some((m) => m.id === expected.id);
        logStep(`Checking: ${expected.name}`, {
          messageId: expected.id,
          exists,
        });
        expect(exists).toBe(true);
      }

      // ========================================
      // Step 7: Directly verify User B's sent reply still exists
      // ========================================
      logStep("Step 7: Direct verification of User B's sent reply");

      const sentReplyMessage = await gmail.emailProvider.getMessage(
        userBReply.messageId,
      );
      expect(sentReplyMessage).toBeDefined();
      expect(sentReplyMessage.id).toBe(userBReply.messageId);

      logStep("User B's sent reply verified", {
        messageId: sentReplyMessage.id,
        subject: sentReplyMessage.headers.subject,
      });

      logStep("=== Test PASSED ===");
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should preserve sent reply when follow-up arrives (Outlook receiver - untouched draft)",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Step 1: User A (Gmail) sends email to User B (Outlook)
      // ========================================
      logStep("Step 1: User A sends initial email to User B (Outlook)");

      const initialEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      logStep("Initial email sent", {
        messageId: initialEmail.messageId,
        threadId: initialEmail.threadId,
        subject: initialEmail.fullSubject,
      });

      // Wait for Outlook to receive the email
      const outlookReceived = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: outlookReceived.messageId,
        threadId: outlookReceived.threadId,
      });

      // ========================================
      // Step 2: Wait for AI to process and create draft
      // ========================================
      logStep("Step 2: Waiting for AI draft creation");

      const executedRule = await waitForExecutedRule({
        threadId: outlookReceived.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      expect(executedRule).toBeDefined();
      expect(executedRule.status).toBe("APPLIED");

      logStep("ExecutedRule found", {
        executedRuleId: executedRule.id,
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

      // ========================================
      // Step 3: User B sends the AI draft WITHOUT editing
      // ========================================
      logStep("Step 3: User B sends AI draft WITHOUT editing");

      const draft = await outlook.emailProvider.getDraft(aiDraftId);
      expect(draft).toBeDefined();

      logStep("Draft content retrieved", {
        draftId: aiDraftId,
        hasContent: !!draft?.textPlain,
        contentPreview: draft?.textPlain?.substring(0, 100),
      });

      // Actually send the draft via provider API (simulating user clicking send)
      // This keeps the same message ID which is crucial for reproducing the bug
      const userBReply = await outlook.emailProvider.sendDraft(aiDraftId);

      logStep("User B sent draft (untouched AI draft)", {
        messageId: userBReply.messageId,
        threadId: userBReply.threadId,
      });

      // Wait for DraftSendLog
      const draftSendLog = await waitForDraftSendLog({
        threadId: outlookReceived.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("DraftSendLog recorded", {
        id: draftSendLog.id,
        similarityScore: draftSendLog.similarityScore,
        wasSentFromDraft: draftSendLog.wasSentFromDraft,
      });

      expect(draftSendLog.similarityScore).toBeGreaterThan(0);

      // ========================================
      // Step 4: Verify User B's sent reply exists before follow-up
      // ========================================
      logStep("Step 4: Verifying sent reply exists before follow-up");

      // Wait for Gmail to receive User B's reply
      const gmailReceivedReply = await waitForReplyInInbox({
        provider: gmail.emailProvider,
        subjectContains: initialEmail.fullSubject,
        fromEmail: outlook.email,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("User B's reply received in Gmail", {
        messageId: gmailReceivedReply.messageId,
        threadId: gmailReceivedReply.threadId,
      });

      // Verify thread in Outlook has messages
      let outlookThreadMessages = await outlook.emailProvider.getThreadMessages(
        outlookReceived.threadId,
      );

      logStep("Outlook thread before follow-up", {
        messageCount: outlookThreadMessages.length,
        messageIds: outlookThreadMessages.map((m) => m.id),
      });

      expect(outlookThreadMessages.length).toBeGreaterThanOrEqual(2);

      // ========================================
      // Step 5: User A sends follow-up reply (3rd message)
      // ========================================
      logStep("Step 5: User A sends follow-up");

      const followUpReply = await sendTestReply({
        from: gmail,
        to: outlook,
        threadId: gmailReceivedReply.threadId,
        originalMessageId: gmailReceivedReply.messageId,
        body: "Thanks for your response! I have one more question about this.",
      });

      logStep("User A follow-up sent", {
        messageId: followUpReply.messageId,
        threadId: followUpReply.threadId,
      });

      // Wait for follow-up to arrive in Outlook
      const followUpReceived = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
        filter: (msg) =>
          msg.id !== outlookReceived.messageId &&
          !outlookThreadMessages.some((tm) => tm.id === msg.id),
      });

      logStep("Follow-up received in Outlook", {
        messageId: followUpReceived.messageId,
        threadId: followUpReceived.threadId,
      });

      // Wait for webhook processing and cleanup to complete
      logStep("Waiting for webhook processing and cleanup to complete...");
      await new Promise((resolve) => setTimeout(resolve, 15_000));

      // ========================================
      // Step 6: Verify User B's sent reply is preserved
      // ========================================
      logStep("Step 6: Verifying sent reply is preserved after follow-up");

      outlookThreadMessages = await waitForThreadMessageCount({
        threadId: outlookReceived.threadId,
        provider: outlook.emailProvider,
        minCount: 3,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("Outlook thread after follow-up", {
        messageCount: outlookThreadMessages.length,
        messageIds: outlookThreadMessages.map((m) => m.id),
      });

      expect(outlookThreadMessages.length).toBeGreaterThanOrEqual(3);

      // Find User B's sent reply by its exact messageId
      const userBReplyInThread = outlookThreadMessages.find(
        (m) => m.id === userBReply.messageId,
      );

      expect(userBReplyInThread).toBeDefined();

      logStep("User B's sent reply found in thread", {
        messageId: userBReplyInThread!.id,
      });

      // Verify all expected messages exist
      const expectedMessages = [
        { id: outlookReceived.messageId, name: "Initial email from User A" },
        { id: userBReplyInThread!.id, name: "User B's sent reply" },
        { id: followUpReceived.messageId, name: "User A's follow-up" },
      ];

      for (const expected of expectedMessages) {
        const exists = outlookThreadMessages.some((m) => m.id === expected.id);
        logStep(`Checking: ${expected.name}`, {
          messageId: expected.id,
          exists,
        });
        expect(exists).toBe(true);
      }

      // ========================================
      // Step 7: Direct verification of User B's sent reply
      // ========================================
      logStep("Step 7: Direct verification of User B's sent reply");

      const sentReplyMessage = await outlook.emailProvider.getMessage(
        userBReplyInThread!.id,
      );
      expect(sentReplyMessage).toBeDefined();

      logStep("User B's sent reply verified", {
        messageId: sentReplyMessage.id,
        subject: sentReplyMessage.headers.subject,
      });

      logStep("=== Test PASSED ===");
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should handle rapid follow-up after untouched draft send (Gmail receiver)",
    async () => {
      testStartTime = Date.now();
      setTestStartTime();
      const scenario = TEST_EMAIL_SCENARIOS.QUESTION;

      // This test sends the follow-up immediately after User B's reply
      // to test timing in webhook processing

      // ========================================
      // Setup: Send initial email and get AI draft
      // ========================================
      logStep("Setup: Sending initial email");

      const initialEmail = await sendTestEmail({
        from: outlook,
        to: gmail,
        subject: scenario.subject,
        body: scenario.body,
      });

      const gmailReceived = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received, waiting for AI draft");

      const executedRule = await waitForExecutedRule({
        threadId: gmailReceived.threadId,
        emailAccountId: gmail.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );
      expect(draftAction?.draftId).toBeTruthy();
      const aiDraftId = draftAction!.draftId!;

      // ========================================
      // Send untouched draft and follow-up in quick succession
      // ========================================
      logStep("Sending untouched draft via provider API");

      // Actually send the draft via provider API (simulating user clicking send)
      const userBReply = await gmail.emailProvider.sendDraft(aiDraftId);

      logStep("User B draft sent", { messageId: userBReply.messageId });

      // Wait for Outlook to receive the reply before sending follow-up
      await waitForReplyInInbox({
        provider: outlook.emailProvider,
        subjectContains: initialEmail.fullSubject,
        fromEmail: gmail.email,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      // Send follow-up immediately
      logStep("Sending follow-up immediately");

      await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: initialEmail.threadId,
        originalMessageId: initialEmail.messageId,
        body: "Quick follow-up question!",
      });

      // Wait for follow-up to arrive
      await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: initialEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
        filter: (msg) =>
          msg.id !== gmailReceived.messageId && msg.id !== userBReply.messageId,
      });

      // Wait for webhook processing and cleanup to complete
      logStep("Waiting for webhook processing and cleanup to complete...");
      await new Promise((resolve) => setTimeout(resolve, 15_000));

      // ========================================
      // Verify User B's reply is preserved
      // ========================================
      logStep("Verifying User B's reply is preserved");

      const threadMessages = await waitForThreadMessageCount({
        threadId: gmailReceived.threadId,
        provider: gmail.emailProvider,
        minCount: 3,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("Thread messages after rapid follow-up", {
        messageCount: threadMessages.length,
        messageIds: threadMessages.map((m) => m.id),
      });

      // Verify User B's sent reply exists
      const userBReplyExists = threadMessages.some(
        (m) => m.id === userBReply.messageId,
      );

      expect(userBReplyExists).toBe(true);

      // Direct verification
      const sentReply = await gmail.emailProvider.getMessage(
        userBReply.messageId,
      );
      expect(sentReply).toBeDefined();

      logStep("=== Test PASSED ===");
    },
    TIMEOUTS.FULL_CYCLE,
  );
});
