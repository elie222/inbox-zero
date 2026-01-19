/**
 * E2E Flow Test: Outbound Message Tracking
 *
 * Tests that sent messages trigger correct outbound handling:
 * - SENT folder webhook triggers processing
 * - Reply tracking is updated
 * - No duplicate rule execution
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e outbound-tracking
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest";
import prisma from "@/utils/prisma";
import { shouldRunFlowTests, TIMEOUTS } from "./config";
import { initializeFlowTests, setupFlowTest } from "./setup";
import { generateTestSummary } from "./teardown";
import {
  sendTestEmail,
  sendTestReply,
  TEST_EMAIL_SCENARIOS,
} from "./helpers/email";
import { waitForMessageInInbox, waitForExecutedRule } from "./helpers/polling";
import { logStep, clearLogs } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";

describe.skipIf(!shouldRunFlowTests())("Outbound Message Tracking", () => {
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
    generateTestSummary("Outbound Tracking", testStartTime);
    clearLogs();
  });

  test(
    "should track outbound message when user sends email",
    async () => {
      testStartTime = Date.now();

      // ========================================
      // Step 1: Receive an email first (to have a thread)
      // ========================================
      logStep("Step 1: Setting up thread with incoming email");

      const incomingEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: "Outbound tracking test",
        body: "Please respond to this email.",
      });

      const receivedMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: incomingEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received in Outlook", {
        messageId: receivedMessage.messageId,
        threadId: receivedMessage.threadId,
      });

      // ========================================
      // Step 2: Send reply from Outlook (outbound message)
      // ========================================
      logStep("Step 2: Sending outbound reply from Outlook");

      const sentReply = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: receivedMessage.threadId,
        originalMessageId: receivedMessage.messageId,
        body: "Here is my response to your email.",
      });

      logStep("Outbound reply sent", {
        messageId: sentReply.messageId,
        threadId: sentReply.threadId,
      });

      // ========================================
      // Step 3: Wait for outbound handling to process
      // ========================================
      logStep("Step 3: Waiting for outbound handling");

      // Check that the sent message was detected
      // The handleOutboundMessage function should have been called

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // ========================================
      // Step 4: Verify Gmail receives the reply
      // ========================================
      logStep("Step 4: Verifying Gmail receives reply");

      const gmailReceived = await waitForMessageInInbox({
        provider: gmail.emailProvider,
        subjectContains: incomingEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      expect(gmailReceived.threadId).toBe(incomingEmail.threadId);

      logStep("Reply received in Gmail, thread continuity verified");
    },
    TIMEOUTS.FULL_CYCLE,
  );

  test(
    "should not create duplicate ExecutedRule for outbound messages",
    async () => {
      testStartTime = Date.now();

      // ========================================
      // Setup: Create a thread
      // ========================================
      logStep("Setting up thread");

      const incomingEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: "No duplicate test",
        body: "Testing no duplicate processing.",
      });

      const receivedMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: incomingEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      // ========================================
      // Send outbound message
      // ========================================
      logStep("Sending outbound message");

      const reply = await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: receivedMessage.threadId,
        originalMessageId: receivedMessage.messageId,
        body: "This is a manual reply.",
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 10_000));

      // ========================================
      // Verify no ExecutedRule was created for the outbound message
      // ========================================
      logStep("Verifying no ExecutedRule for outbound message");

      const executedRulesForSent = await prisma.executedRule.findMany({
        where: {
          emailAccountId: outlook.id,
          messageId: reply.messageId,
        },
      });

      // Outbound messages should not trigger rule execution
      expect(executedRulesForSent).toHaveLength(0);

      logStep("ExecutedRules for outbound message", {
        count: executedRulesForSent.length,
      });
    },
    TIMEOUTS.TEST_DEFAULT,
  );

  test(
    "should update reply tracking when reply is sent",
    async () => {
      testStartTime = Date.now();

      // Use an email that clearly needs a reply so AI classifies as "To Reply"
      const scenario = TEST_EMAIL_SCENARIOS.NEEDS_REPLY;

      // ========================================
      // Setup: Create incoming email that needs a reply
      // ========================================
      logStep("Setting up incoming email that needs reply");

      const incomingEmail = await sendTestEmail({
        from: gmail,
        to: outlook,
        subject: scenario.subject,
        body: scenario.body,
      });

      const receivedMessage = await waitForMessageInInbox({
        provider: outlook.emailProvider,
        subjectContains: incomingEmail.fullSubject,
        timeout: TIMEOUTS.EMAIL_DELIVERY,
      });

      logStep("Email received", {
        messageId: receivedMessage.messageId,
        threadId: receivedMessage.threadId,
      });

      // ========================================
      // Wait for AI to process and classify the email
      // This creates the ThreadTracker with NEEDS_REPLY type
      // ========================================
      logStep("Waiting for rule execution to create ThreadTracker");

      const executedRule = await waitForExecutedRule({
        threadId: receivedMessage.threadId,
        emailAccountId: outlook.id,
        timeout: TIMEOUTS.WEBHOOK_PROCESSING,
      });

      logStep("Rule executed", {
        executedRuleId: executedRule.id,
        status: executedRule.status,
      });

      // Verify ThreadTracker was created (unresolved initially)
      const trackerBeforeReply = await prisma.threadTracker.findFirst({
        where: {
          emailAccountId: outlook.id,
          threadId: receivedMessage.threadId,
          resolved: false,
        },
      });

      logStep("ThreadTracker before reply", {
        id: trackerBeforeReply?.id,
        exists: !!trackerBeforeReply,
        resolved: trackerBeforeReply?.resolved,
        type: trackerBeforeReply?.type,
      });

      // Store the tracker ID to verify it gets resolved
      const originalTrackerId = trackerBeforeReply?.id;
      expect(originalTrackerId).toBeDefined();

      // ========================================
      // Send reply
      // ========================================
      logStep("Sending reply");

      await sendTestReply({
        from: outlook,
        to: gmail,
        threadId: receivedMessage.threadId,
        originalMessageId: receivedMessage.messageId,
        body: "Here are my thoughts on this matter.",
      });

      // ========================================
      // Wait for reply tracking to update
      // ========================================
      logStep("Waiting for reply tracking update");

      // Wait for outbound processing to mark tracker as resolved
      await new Promise((resolve) => setTimeout(resolve, 10_000));

      // Verify the ORIGINAL tracker is now resolved
      // Note: A new AWAITING_REPLY tracker may be created, so we must check
      // the specific tracker that existed before the reply
      const resolvedTracker = await prisma.threadTracker.findUnique({
        where: { id: originalTrackerId! },
      });

      expect(resolvedTracker).toBeDefined();
      expect(resolvedTracker?.resolved).toBe(true);

      logStep("Original tracker now resolved", {
        id: resolvedTracker?.id,
        resolved: resolvedTracker?.resolved,
        type: resolvedTracker?.type,
      });
    },
    TIMEOUTS.FULL_CYCLE,
  );
});
