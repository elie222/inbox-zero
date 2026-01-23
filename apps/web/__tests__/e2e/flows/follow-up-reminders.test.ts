/**
 * E2E Flow Test: Follow-up Reminders
 *
 * Tests the real E2E flow of follow-up reminders:
 * - Send real emails between test accounts
 * - ThreadTrackers are created via AI-powered conversation tracking (not bypassed)
 * - Apply Follow-up label to AWAITING threads (sent email, waiting for reply)
 * - Apply Follow-up label to NEEDS_REPLY threads (received email, needs reply)
 * - Generate draft follow-up emails when enabled (AWAITING only)
 *
 * Edge case tests use direct DB insertion for specific scenarios like:
 * - Resolved trackers, already-processed trackers, and threshold enforcement
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e follow-up-reminders
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { subMinutes } from "date-fns/subMinutes";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";
import { shouldRunFlowTests, TIMEOUTS } from "./config";
import { initializeFlowTests, setupFlowTest } from "./setup";
import { generateTestSummary } from "./teardown";
import { sendTestEmail, sendTestReply } from "./helpers/email";
import {
  waitForMessageInInbox,
  waitForFollowUpLabel,
  waitForThreadTracker,
} from "./helpers/polling";
import { logStep, clearLogs } from "./helpers/logging";
import {
  ensureConversationRules,
  disableNonConversationRules,
  enableAllRules,
} from "./helpers/accounts";
import type { TestAccount } from "./helpers/accounts";
import { processAccountFollowUps } from "@/app/api/follow-up-reminders/process";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { getOrCreateFollowUpLabel } from "@/utils/follow-up/labels";
import type { EmailProvider } from "@/utils/email/types";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";

const testLogger = createScopedLogger("e2e-follow-up-test");

// Helper to apply the "Awaiting Reply" label to a thread for edge case tests
// (Main tests use real E2E flow where conversation rules apply this label)
async function ensureAwaitingReplyLabel(
  provider: EmailProvider,
  threadId: string,
  messageId: string,
): Promise<string> {
  const labels = await provider.getLabels();
  const labelName = getRuleLabel(SystemType.AWAITING_REPLY);
  let labelId = labels.find((l) => l.name === labelName)?.id;

  if (!labelId) {
    const created = await provider.createLabel({ name: labelName });
    labelId = created.id;
  }

  await provider.labelMessage({ messageId, labelId, labelName });
  return labelId;
}

// Helper to create a ThreadTracker directly for edge case tests only
// (Main tests use real E2E flow with AI-powered tracker creation)
async function createTestThreadTracker(options: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  type: ThreadTrackerType;
  sentAt?: Date;
  resolved?: boolean;
  followUpAppliedAt?: Date | null;
}) {
  return prisma.threadTracker.create({
    data: {
      emailAccountId: options.emailAccountId,
      threadId: options.threadId,
      messageId: options.messageId,
      type: options.type,
      sentAt: options.sentAt ?? subMinutes(new Date(), 5), // Default: 5 minutes ago
      resolved: options.resolved ?? false,
      followUpAppliedAt: options.followUpAppliedAt ?? null,
    },
  });
}

// Helper to get email account with all required fields for processAccountFollowUps
async function getEmailAccountForProcessing(emailAccountId: string) {
  return prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      account: { select: { provider: true } },
    },
  });
}

// Helper to configure follow-up settings
async function configureFollowUpSettings(
  emailAccountId: string,
  settings: {
    followUpAwaitingReplyDays?: number | null;
    followUpNeedsReplyDays?: number | null;
    followUpAutoDraftEnabled?: boolean;
  },
) {
  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: settings,
  });
}

// Helper to cleanup test artifacts
async function cleanupThreadTrackers(emailAccountId: string, threadId: string) {
  await prisma.threadTracker.deleteMany({
    where: {
      emailAccountId,
      threadId,
    },
  });
}

describe.skipIf(!shouldRunFlowTests())("Follow-up Reminders", () => {
  let gmail: TestAccount;
  let outlook: TestAccount;
  let testStartTime: number;

  beforeAll(async () => {
    await initializeFlowTests();
    const accounts = await setupFlowTest();
    gmail = accounts.gmail;
    outlook = accounts.outlook;

    // Ensure conversation rules exist (needed for ThreadTracker creation via real E2E flow)
    await ensureConversationRules(gmail.id);
    await ensureConversationRules(outlook.id);

    // Disable non-conversation rules (like AI Auto-Reply) to avoid interference
    // Keep conversation rules enabled for ThreadTracker creation
    await disableNonConversationRules(gmail.id);
    await disableNonConversationRules(outlook.id);
  }, TIMEOUTS.TEST_DEFAULT);

  afterAll(async () => {
    // Re-enable rules for other test suites
    if (gmail?.id) await enableAllRules(gmail.id);
    if (outlook?.id) await enableAllRules(outlook.id);
  });

  afterEach(async () => {
    generateTestSummary("Follow-up Reminders", testStartTime);
    clearLogs();
  });

  // ============================================================
  // Gmail Provider Tests
  // ============================================================
  describe("Gmail Provider", () => {
    test(
      "should apply follow-up label and create draft for AWAITING type",
      async () => {
        testStartTime = Date.now();

        // ========================================
        // Step 1: Outlook sends initial email to Gmail
        // ========================================
        logStep("Step 1: Outlook sends email to Gmail");

        const initialEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Gmail AWAITING follow-up test",
          body: "Here's the information you requested earlier.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: initialEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Email received in Gmail", {
          messageId: receivedMessage.messageId,
          threadId: receivedMessage.threadId,
        });

        // ========================================
        // Step 2: Gmail replies with clear "awaiting reply" language
        // This triggers outbound message handling → AI analysis → AWAITING tracker
        // ========================================
        logStep("Step 2: Gmail sends reply (triggers AWAITING tracker)");

        const gmailReply = await sendTestReply({
          from: gmail,
          to: outlook,
          threadId: receivedMessage.threadId,
          originalMessageId: receivedMessage.messageId,
          body: "Thanks! Can you please confirm you received this and let me know if you need anything else?",
        });

        logStep("Gmail reply sent", { messageId: gmailReply.messageId });

        // ========================================
        // Step 3: Wait for ThreadTracker to be created by real E2E flow
        // ========================================
        logStep("Step 3: Waiting for ThreadTracker creation (via AI)");

        const tracker = await waitForThreadTracker({
          threadId: receivedMessage.threadId,
          emailAccountId: gmail.id,
          type: ThreadTrackerType.AWAITING,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("ThreadTracker created via real flow", {
          trackerId: tracker.id,
          type: tracker.type,
        });

        // Wait for threshold to pass (tracker.sentAt must be older than threshold)
        logStep("Waiting for threshold to pass");
        await sleep(1000); // 1 second > 0.00001 days (~0.86 seconds)

        // ========================================
        // Step 4: Configure follow-up settings
        // ========================================
        logStep("Step 4: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.000_01, // ~0.86 seconds
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        // ========================================
        // Step 5: Process follow-ups
        // ========================================
        logStep("Step 5: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        expect(emailAccount).not.toBeNull();

        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 6: Assert label was applied
        // ========================================
        logStep(
          "Step 6: Verifying Follow-up label on last message (Gmail's reply)",
        );

        // The label is applied to the LAST message in the thread (Gmail's reply)
        await waitForFollowUpLabel({
          messageId: gmailReply.messageId,
          provider: gmail.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("Follow-up label verified on Gmail reply");

        // ========================================
        // Step 7: Assert draft was created
        // ========================================
        logStep("Step 7: Verifying draft creation");

        const drafts = await gmail.emailProvider.getDrafts({ maxResults: 50 });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBeGreaterThan(0);
        logStep("Draft created", { draftCount: threadDrafts.length });

        // ========================================
        // Step 8: Assert tracker was updated
        // ========================================
        logStep("Step 8: Verifying tracker update");

        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });

        expect(updatedTracker?.followUpAppliedAt).not.toBeNull();
        logStep("Tracker followUpAppliedAt verified");

        // Cleanup
        await cleanupThreadTrackers(gmail.id, receivedMessage.threadId);
        // Delete the draft
        if (threadDrafts[0]?.id) {
          await gmail.emailProvider.deleteDraft(threadDrafts[0].id);
        }
      },
      TIMEOUTS.FULL_CYCLE,
    );

    test(
      "should apply follow-up label WITHOUT draft when auto-draft disabled",
      async () => {
        testStartTime = Date.now();

        // ========================================
        // Step 1: Outlook sends initial email to Gmail
        // ========================================
        logStep("Step 1: Outlook sends email to Gmail");

        const initialEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Gmail AWAITING no-draft test",
          body: "Here's an update on the project.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: initialEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        // ========================================
        // Step 2: Gmail replies (triggers AWAITING tracker)
        // ========================================
        logStep("Step 2: Gmail sends reply (triggers AWAITING tracker)");

        const gmailReply = await sendTestReply({
          from: gmail,
          to: outlook,
          threadId: receivedMessage.threadId,
          originalMessageId: receivedMessage.messageId,
          body: "Got it, can you please send me the final numbers when you have them?",
        });

        logStep("Gmail reply sent", { messageId: gmailReply.messageId });

        // ========================================
        // Step 3: Wait for ThreadTracker creation
        // ========================================
        logStep("Step 3: Waiting for ThreadTracker creation");

        const tracker = await waitForThreadTracker({
          threadId: receivedMessage.threadId,
          emailAccountId: gmail.id,
          type: ThreadTrackerType.AWAITING,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // Wait for threshold to pass
        logStep("Waiting for threshold to pass");
        await sleep(1000);

        // ========================================
        // Step 4: Configure follow-up settings (draft disabled)
        // ========================================
        logStep("Step 4: Configuring follow-up settings (draft disabled)");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.000_01, // ~0.86 seconds
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: false, // Draft disabled
        });

        // ========================================
        // Step 5: Process follow-ups
        // ========================================
        logStep("Step 5: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 6: Verify Follow-up label on last message (Gmail's reply)
        // ========================================
        logStep("Step 6: Verifying Follow-up label on last message");

        await waitForFollowUpLabel({
          messageId: gmailReply.messageId,
          provider: gmail.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // ========================================
        // Step 7: Verify NO draft created
        // ========================================
        logStep("Step 7: Verifying NO draft created");

        const drafts = await gmail.emailProvider.getDrafts({ maxResults: 50 });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBe(0);
        logStep("Confirmed no draft created");

        // Verify tracker updated
        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });
        expect(updatedTracker?.followUpAppliedAt).not.toBeNull();

        // Cleanup
        await cleanupThreadTrackers(gmail.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );

    test(
      "should apply follow-up label for NEEDS_REPLY type (no draft)",
      async () => {
        testStartTime = Date.now();

        // ========================================
        // Step 1: Outlook sends email with clear question (triggers NEEDS_REPLY)
        // The conversation rules process this as TO_REPLY → creates NEEDS_REPLY tracker
        // ========================================
        logStep("Step 1: Outlook sends email requiring reply");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Gmail NEEDS_REPLY follow-up test",
          body: "Can you please send me the quarterly report by Friday? I need to review it for the board meeting.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Email received in Gmail", {
          messageId: receivedMessage.messageId,
          threadId: receivedMessage.threadId,
        });

        // ========================================
        // Step 2: Wait for ThreadTracker creation (via conversation rules)
        // ========================================
        logStep("Step 2: Waiting for ThreadTracker creation (via AI)");

        const tracker = await waitForThreadTracker({
          threadId: receivedMessage.threadId,
          emailAccountId: gmail.id,
          type: ThreadTrackerType.NEEDS_REPLY,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("ThreadTracker created via real flow", {
          trackerId: tracker.id,
          type: tracker.type,
        });

        // Wait for threshold to pass
        logStep("Waiting for threshold to pass");
        await sleep(1000);

        // ========================================
        // Step 3: Configure follow-up settings
        // ========================================
        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: null,
          followUpNeedsReplyDays: 0.000_01, // ~0.86 seconds
          followUpAutoDraftEnabled: true, // Even if enabled, NEEDS_REPLY never gets draft
        });

        // ========================================
        // Step 4: Process follow-ups
        // ========================================
        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 5: Verify Follow-up label on received message (last in thread)
        // ========================================
        logStep("Step 5: Verifying Follow-up label on received message");

        // For NEEDS_REPLY, there's no reply sent, so received message IS the last message
        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: gmail.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // ========================================
        // Step 6: Verify NO draft created (NEEDS_REPLY never gets draft)
        // ========================================
        logStep(
          "Step 6: Verifying NO draft created (NEEDS_REPLY never gets draft)",
        );

        const drafts = await gmail.emailProvider.getDrafts({ maxResults: 50 });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBe(0);
        logStep("Confirmed no draft created for NEEDS_REPLY");

        // Verify tracker updated
        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });
        expect(updatedTracker?.followUpAppliedAt).not.toBeNull();

        // Cleanup
        await cleanupThreadTrackers(gmail.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );
  });

  // ============================================================
  // Outlook Provider Tests
  // ============================================================
  describe("Outlook Provider", () => {
    test(
      "should apply follow-up label and create draft for AWAITING type",
      async () => {
        testStartTime = Date.now();

        // ========================================
        // Step 1: Gmail sends initial email to Outlook
        // ========================================
        logStep("Step 1: Gmail sends email to Outlook");

        const initialEmail = await sendTestEmail({
          from: gmail,
          to: outlook,
          subject: "Outlook AWAITING follow-up test",
          body: "Here's the information you requested earlier.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: outlook.emailProvider,
          subjectContains: initialEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Email received in Outlook", {
          messageId: receivedMessage.messageId,
          threadId: receivedMessage.threadId,
        });

        // ========================================
        // Step 2: Outlook replies (triggers AWAITING tracker)
        // ========================================
        logStep("Step 2: Outlook sends reply (triggers AWAITING tracker)");

        const outlookReply = await sendTestReply({
          from: outlook,
          to: gmail,
          threadId: receivedMessage.threadId,
          originalMessageId: receivedMessage.messageId,
          body: "Thanks! Can you please confirm you received this and let me know if you need anything else?",
        });

        logStep("Outlook reply sent", { messageId: outlookReply.messageId });

        // ========================================
        // Step 3: Wait for ThreadTracker creation
        // ========================================
        logStep("Step 3: Waiting for ThreadTracker creation (via AI)");

        const tracker = await waitForThreadTracker({
          threadId: receivedMessage.threadId,
          emailAccountId: outlook.id,
          type: ThreadTrackerType.AWAITING,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("ThreadTracker created via real flow", {
          trackerId: tracker.id,
          type: tracker.type,
        });

        // Wait for threshold to pass
        logStep("Waiting for threshold to pass");
        await sleep(1000);

        // ========================================
        // Step 4: Configure follow-up settings
        // ========================================
        logStep("Step 4: Configuring follow-up settings");

        await configureFollowUpSettings(outlook.id, {
          followUpAwaitingReplyDays: 0.000_01, // ~0.86 seconds
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        // ========================================
        // Step 5: Process follow-ups
        // ========================================
        logStep("Step 5: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(outlook.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 6: Verify Follow-up label on last message (Outlook's reply)
        // ========================================
        logStep("Step 6: Verifying Follow-up label on last message");

        await waitForFollowUpLabel({
          messageId: outlookReply.messageId,
          provider: outlook.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // ========================================
        // Step 7: Verify draft creation
        // ========================================
        logStep("Step 7: Verifying draft creation");

        const drafts = await outlook.emailProvider.getDrafts({
          maxResults: 50,
        });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBeGreaterThan(0);
        logStep("Draft created", { draftCount: threadDrafts.length });

        // ========================================
        // Step 8: Verify tracker updated
        // ========================================
        logStep("Step 8: Verifying tracker update");

        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });
        expect(updatedTracker?.followUpAppliedAt).not.toBeNull();

        // Cleanup
        await cleanupThreadTrackers(outlook.id, receivedMessage.threadId);
        if (threadDrafts[0]?.id) {
          await outlook.emailProvider.deleteDraft(threadDrafts[0].id);
        }
      },
      TIMEOUTS.FULL_CYCLE,
    );

    test(
      "should apply follow-up label WITHOUT draft when auto-draft disabled",
      async () => {
        testStartTime = Date.now();

        // ========================================
        // Step 1: Gmail sends initial email to Outlook
        // ========================================
        logStep("Step 1: Gmail sends email to Outlook");

        const initialEmail = await sendTestEmail({
          from: gmail,
          to: outlook,
          subject: "Outlook AWAITING no-draft test",
          body: "Here's an update on the project.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: outlook.emailProvider,
          subjectContains: initialEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        // ========================================
        // Step 2: Outlook replies (triggers AWAITING tracker)
        // ========================================
        logStep("Step 2: Outlook sends reply (triggers AWAITING tracker)");

        const outlookReply = await sendTestReply({
          from: outlook,
          to: gmail,
          threadId: receivedMessage.threadId,
          originalMessageId: receivedMessage.messageId,
          body: "Got it, can you please send me the final numbers when you have them?",
        });

        logStep("Outlook reply sent", { messageId: outlookReply.messageId });

        // ========================================
        // Step 3: Wait for ThreadTracker creation
        // ========================================
        logStep("Step 3: Waiting for ThreadTracker creation");

        const tracker = await waitForThreadTracker({
          threadId: receivedMessage.threadId,
          emailAccountId: outlook.id,
          type: ThreadTrackerType.AWAITING,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // Wait for threshold to pass
        logStep("Waiting for threshold to pass");
        await sleep(1000);

        // ========================================
        // Step 4: Configure follow-up settings (draft disabled)
        // ========================================
        logStep("Step 4: Configuring follow-up settings (draft disabled)");

        await configureFollowUpSettings(outlook.id, {
          followUpAwaitingReplyDays: 0.000_01, // ~0.86 seconds
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: false,
        });

        // ========================================
        // Step 5: Process follow-ups
        // ========================================
        logStep("Step 5: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(outlook.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 6: Verify Follow-up label on last message (Outlook's reply)
        // ========================================
        logStep("Step 6: Verifying Follow-up label on last message");

        await waitForFollowUpLabel({
          messageId: outlookReply.messageId,
          provider: outlook.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // ========================================
        // Step 7: Verify NO draft created
        // ========================================
        logStep("Step 7: Verifying NO draft created");

        const drafts = await outlook.emailProvider.getDrafts({
          maxResults: 50,
        });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBe(0);

        // Verify tracker updated
        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });
        expect(updatedTracker?.followUpAppliedAt).not.toBeNull();

        // Cleanup
        await cleanupThreadTrackers(outlook.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );

    test(
      "should apply follow-up label for NEEDS_REPLY type (no draft)",
      async () => {
        testStartTime = Date.now();

        // ========================================
        // Step 1: Gmail sends email with clear question (triggers NEEDS_REPLY)
        // ========================================
        logStep("Step 1: Gmail sends email requiring reply");

        const sentEmail = await sendTestEmail({
          from: gmail,
          to: outlook,
          subject: "Outlook NEEDS_REPLY follow-up test",
          body: "Can you please send me the quarterly report by Friday? I need to review it for the board meeting.",
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
        // Step 2: Wait for ThreadTracker creation (via conversation rules)
        // ========================================
        logStep("Step 2: Waiting for ThreadTracker creation (via AI)");

        const tracker = await waitForThreadTracker({
          threadId: receivedMessage.threadId,
          emailAccountId: outlook.id,
          type: ThreadTrackerType.NEEDS_REPLY,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("ThreadTracker created via real flow", {
          trackerId: tracker.id,
          type: tracker.type,
        });

        // Wait for threshold to pass
        logStep("Waiting for threshold to pass");
        await sleep(1000);

        // ========================================
        // Step 3: Configure follow-up settings
        // ========================================
        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(outlook.id, {
          followUpAwaitingReplyDays: null,
          followUpNeedsReplyDays: 0.000_01, // ~0.86 seconds
          followUpAutoDraftEnabled: true,
        });

        // ========================================
        // Step 4: Process follow-ups
        // ========================================
        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(outlook.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 5: Verify Follow-up label on received message (last in thread)
        // ========================================
        logStep("Step 5: Verifying Follow-up label on received message");

        // For NEEDS_REPLY, there's no reply sent, so received message IS the last message
        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: outlook.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        // ========================================
        // Step 6: Verify NO draft created
        // ========================================
        logStep("Step 6: Verifying NO draft created");

        const drafts = await outlook.emailProvider.getDrafts({
          maxResults: 50,
        });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBe(0);

        // Verify tracker updated
        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });
        expect(updatedTracker?.followUpAppliedAt).not.toBeNull();

        // Cleanup
        await cleanupThreadTrackers(outlook.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );
  });

  // ============================================================
  // Edge Cases
  // ============================================================
  describe("Edge Cases", () => {
    test(
      "should not apply follow-up to resolved trackers",
      async () => {
        testStartTime = Date.now();

        // Note: In the real flow, when a tracker is resolved, the AWAITING_REPLY
        // label is removed from the thread. So we don't apply the label here.
        // The thread won't be found by the label query, which is the correct behavior.

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Resolved tracker test",
          body: "Testing resolved tracker behavior.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Creating RESOLVED ThreadTracker (without label)");

        await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5),
          resolved: true, // Already resolved
        });

        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.000_01, // ~0.86 seconds (sentAt is 5 min ago, exceeds this)
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // Wait a moment for any async processing
        await sleep(1000);

        logStep(
          "Step 5: Verifying NO Follow-up label (resolved tracker skipped)",
        );

        // Get the actual Follow-up label ID to check against
        const followUpLabel = await getOrCreateFollowUpLabel(
          gmail.emailProvider,
        );
        const message = await gmail.emailProvider.getMessage(
          receivedMessage.messageId,
        );
        const hasFollowUpLabel = message.labelIds?.includes(followUpLabel.id);

        expect(hasFollowUpLabel).toBeFalsy();
        logStep("Confirmed resolved tracker was skipped");

        // Cleanup
        await cleanupThreadTrackers(gmail.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );

    test(
      "should skip trackers with followUpAppliedAt already set",
      async () => {
        testStartTime = Date.now();

        // This test verifies idempotency - threads that were already processed
        // should not be re-processed even if they still have the AWAITING_REPLY label.

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Already processed tracker test",
          body: "Testing already processed tracker behavior.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Applying AWAITING_REPLY label");

        await ensureAwaitingReplyLabel(
          gmail.emailProvider,
          receivedMessage.threadId,
          receivedMessage.messageId,
        );

        logStep("Step 3: Creating ThreadTracker with followUpAppliedAt set");

        await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5),
          followUpAppliedAt: new Date(), // Already processed
        });

        logStep("Step 4: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.000_01, // ~0.86 seconds (message is 5 min ago, exceeds this)
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 5: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // Wait a moment
        await sleep(1000);

        logStep("Step 6: Verifying NO new Follow-up label or draft");

        // The key assertion is no NEW draft was created
        // (Label might have been applied before during the previous followUpAppliedAt)
        const drafts = await gmail.emailProvider.getDrafts({ maxResults: 50 });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBe(0);
        logStep("Confirmed already-processed tracker was skipped");

        // Cleanup
        await cleanupThreadTrackers(gmail.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );

    test(
      "should not process trackers that have not passed threshold",
      async () => {
        testStartTime = Date.now();

        // This test verifies threshold enforcement - threads with recent messages
        // should not be processed even if they have the AWAITING_REPLY label.
        // The new code checks message.internalDate (not tracker.sentAt) against threshold.

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Not past threshold test",
          body: "Testing threshold enforcement.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Applying AWAITING_REPLY label");

        await ensureAwaitingReplyLabel(
          gmail.emailProvider,
          receivedMessage.threadId,
          receivedMessage.messageId,
        );

        logStep("Step 3: Creating ThreadTracker");

        // Create tracker (the message was just received, so message.internalDate is recent)
        const tracker = await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: new Date(),
        });

        logStep("Step 4: Configuring follow-up settings (1 day threshold)");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 1, // 1 day threshold - message is too recent
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 5: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // Wait a moment
        await sleep(1000);

        logStep(
          "Step 6: Verifying NO Follow-up label (message not past threshold)",
        );

        // Get the actual Follow-up label ID to check against
        const followUpLabel = await getOrCreateFollowUpLabel(
          gmail.emailProvider,
        );
        const message = await gmail.emailProvider.getMessage(
          receivedMessage.messageId,
        );
        const hasFollowUpLabel = message.labelIds?.includes(followUpLabel.id);

        expect(hasFollowUpLabel).toBeFalsy();

        // Verify tracker was NOT updated
        const updatedTracker = await prisma.threadTracker.findUnique({
          where: { id: tracker.id },
        });
        expect(updatedTracker?.followUpAppliedAt).toBeNull();
        logStep("Confirmed tracker not past threshold was skipped");

        // Cleanup
        await cleanupThreadTrackers(gmail.id, receivedMessage.threadId);
      },
      TIMEOUTS.FULL_CYCLE,
    );
  });
});
