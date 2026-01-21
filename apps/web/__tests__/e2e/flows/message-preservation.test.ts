/**
 * E2E Flow Test: Message Preservation During Draft Cleanup
 *
 * Tests that real messages are NOT deleted during AI draft cleanup operations.
 * This test was created to reproduce a bug where a follow-up message in a thread
 * was accidentally deleted when draft cleanup ran.
 *
 * Scenario being tested:
 * 1. External sender sends first message to user
 * 2. AI creates draft reply
 * 3. External sender sends SECOND message (follow-up) to the same thread
 * 4. Verify: The second message is preserved (NOT deleted)
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e message-preservation
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
} from "./helpers/polling";
import { logStep, clearLogs } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";

describe.skipIf(!shouldRunFlowTests())("Message Preservation", () => {
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
    generateTestSummary("Message Preservation", testStartTime);
    clearLogs();
  });

  test(
    "should NOT delete follow-up message when sender sends second message to thread",
    async () => {
      testStartTime = Date.now();
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Step 1: External sender (Outlook) sends first message to user (Gmail)
      // Using Gmail as receiver since Gmail pub/sub webhooks work better locally
      // ========================================
      logStep("Step 1: External sender sends first message");

      const firstEmail = await sendTestEmail({
        from: outlook,
        to: gmail,
        subject: `Preservation test - ${scenario.subject}`,
        body: scenario.body,
      });

      const firstReceived = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: firstEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("First message received", {
        messageId: firstReceived.messageId,
        threadId: firstReceived.threadId,
      });

      // ========================================
      // Step 2: Wait for AI draft to be created
      // ========================================
      logStep("Step 2: Waiting for AI draft creation");

      const executedRule = await waitForExecutedRule({
        threadId: firstReceived.threadId,
        emailAccountId: gmail.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

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

      // Verify draft exists
      const aiDraft = await gmail.emailProvider.getDraft(aiDraftId);
      expect(aiDraft).toBeDefined();
      logStep("Verified AI draft exists", {
        draftId: aiDraftId,
        draftMessageId: aiDraft?.id,
      });

      // ========================================
      // Step 3: External sender sends SECOND message (follow-up)
      // This is the message that was getting deleted in the bug
      // ========================================
      logStep("Step 3: External sender sends follow-up message");

      // Important: Send from Outlook to Gmail (same as first message)
      // This simulates the sender following up before user responds
      const followUpEmail = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: firstReceived.threadId,
        originalMessageId: firstReceived.messageId,
        body: "I wanted to add some more context to my previous message. Please let me know your thoughts on this.",
      });

      logStep("Follow-up sent from external sender", {
        messageId: followUpEmail.messageId,
        threadId: followUpEmail.threadId,
      });

      // Wait for the follow-up to be received and processed
      // Use a slightly longer timeout to ensure webhook processing completes
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // ========================================
      // Step 4: CRITICAL - Verify the follow-up message still exists
      // This is the bug we're testing for - the message should NOT be deleted
      // ========================================
      logStep("Step 4: Verifying follow-up message was NOT deleted");

      // Get all messages in the thread
      const threadMessages = await gmail.emailProvider.getThreadMessages(
        firstReceived.threadId,
      );

      logStep("Thread messages retrieved", {
        messageCount: threadMessages.length,
        messageIds: threadMessages.map((m) => m.id),
      });

      // Should have at least 2 messages (first + follow-up)
      // Note: May have 3 if the AI draft message is counted
      expect(threadMessages.length).toBeGreaterThanOrEqual(2);

      // Verify both the first message and follow-up still exist
      const firstMessageStillExists = threadMessages.some(
        (m) => m.id === firstReceived.messageId,
      );
      const followUpStillExists = threadMessages.some(
        (m) => m.id === followUpEmail.messageId,
      );

      logStep("Message existence check", {
        firstMessageId: firstReceived.messageId,
        firstMessageExists: firstMessageStillExists,
        followUpMessageId: followUpEmail.messageId,
        followUpExists: followUpStillExists,
      });

      expect(firstMessageStillExists).toBe(true);
      expect(followUpStillExists).toBe(true);

      // ========================================
      // Step 5: Verify by directly getting the follow-up message
      // ========================================
      logStep("Step 5: Directly verifying follow-up message");

      try {
        const followUpMessage = await gmail.emailProvider.getMessage(
          followUpEmail.messageId,
        );
        expect(followUpMessage).toBeDefined();
        expect(followUpMessage.id).toBe(followUpEmail.messageId);
        logStep("Follow-up message verified - NOT deleted", {
          messageId: followUpMessage.id,
          subject: followUpMessage.headers.subject,
        });
      } catch (error) {
        // If we get a "not found" error, that's the bug!
        logStep("ERROR: Follow-up message was deleted!", {
          error: String(error),
        });
        throw new Error(
          `BUG REPRODUCED: Follow-up message ${followUpEmail.messageId} was deleted during draft cleanup. This should NOT happen.`,
        );
      }

      // ========================================
      // Step 6: Additional check - verify draft still exists (it should, since user hasn't replied)
      // ========================================
      logStep("Step 6: Checking if AI draft still exists");

      const draftAfterFollowUp = await gmail.emailProvider.getDraft(aiDraftId);
      logStep("AI draft status after follow-up", {
        draftId: aiDraftId,
        stillExists: !!draftAfterFollowUp,
      });
      // Note: Draft may or may not exist depending on implementation
      // The key thing is that the follow-up message was NOT deleted
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should preserve all thread messages when user sends reply after receiving multiple messages",
    async () => {
      testStartTime = Date.now();

      // ========================================
      // Setup: External sender sends multiple messages, then user replies
      // Using Gmail as receiver since Gmail pub/sub webhooks work better locally
      // ========================================
      logStep("Setup: Creating thread with multiple messages from sender");

      // First message
      const firstEmail = await sendTestEmail({
        from: outlook,
        to: gmail,
        subject: "Multi-message preservation test",
        body: "This is my first question about the project.",
      });

      const firstReceived = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: firstEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("First message received", {
        messageId: firstReceived.messageId,
        threadId: firstReceived.threadId,
      });

      // Wait for AI to process first message
      const executedRule = await waitForExecutedRule({
        threadId: firstReceived.threadId,
        emailAccountId: gmail.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      const draftAction = executedRule.actionItems.find(
        (a) => a.type === "DRAFT_EMAIL" && a.draftId,
      );
      const aiDraftId = draftAction?.draftId;
      logStep("AI draft created", { draftId: aiDraftId });

      // Second message from sender (follow-up)
      const secondEmail = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: firstReceived.threadId,
        originalMessageId: firstReceived.messageId,
        body: "Actually, I have one more question I forgot to ask.",
      });

      logStep("Second message sent from external sender", {
        messageId: secondEmail.messageId,
      });

      // Wait for second message to be received and processed
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // ========================================
      // Now user sends a reply (triggers outbound handling and cleanup)
      // ========================================
      logStep("User sends reply to the thread");

      const userReply = await sendTestReply({
        from: gmail,
        to: outlook,
        threadId: firstReceived.threadId,
        originalMessageId: firstReceived.messageId,
        body: "Thanks for reaching out. Here is my response to your questions.",
      });

      logStep("User reply sent", { messageId: userReply.messageId });

      // Wait for webhook processing (cleanup runs here)
      await new Promise((resolve) => setTimeout(resolve, 10_000));

      // ========================================
      // CRITICAL: Verify all messages still exist
      // ========================================
      logStep("Verifying all messages preserved after user reply");

      const threadMessages = await gmail.emailProvider.getThreadMessages(
        firstReceived.threadId,
      );

      logStep("Thread messages after user reply", {
        messageCount: threadMessages.length,
        messageIds: threadMessages.map((m) => m.id),
      });

      // Verify all 3 messages exist (first, second from sender, user reply)
      // The outbound user reply triggers cleanup, but should NOT delete sender messages
      expect(threadMessages.length).toBeGreaterThanOrEqual(3);

      // Verify each message
      const messages = [
        { id: firstReceived.messageId, name: "First message" },
        {
          id: secondEmail.messageId,
          name: "Second message (sender follow-up)",
        },
        { id: userReply.messageId, name: "User reply" },
      ];

      for (const msg of messages) {
        const exists = threadMessages.some((m) => m.id === msg.id);
        logStep(`Checking ${msg.name}`, {
          messageId: msg.id,
          exists,
        });

        if (!exists) {
          throw new Error(
            `BUG: ${msg.name} (${msg.id}) was deleted! This should NOT happen.`,
          );
        }
        expect(exists).toBe(true);
      }

      logStep("All messages preserved successfully");
    },
    TIMEOUTS.FULL_CYCLE,
  );
});
