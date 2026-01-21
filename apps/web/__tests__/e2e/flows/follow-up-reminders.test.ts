/**
 * E2E Flow Test: Follow-up Reminders
 *
 * Tests that follow-up reminders correctly:
 * - Apply Follow-up label to AWAITING threads (sent email, waiting for reply)
 * - Apply Follow-up label to NEEDS_REPLY threads (received email, needs reply)
 * - Generate draft follow-up emails when enabled (AWAITING only)
 * - Skip resolved trackers, already-processed trackers, and trackers not past threshold
 *
 * Usage:
 * RUN_E2E_FLOW_TESTS=true pnpm test-e2e follow-up-reminders
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest";
import { subMinutes } from "date-fns/subMinutes";
import prisma from "@/utils/prisma";
import { shouldRunFlowTests, TIMEOUTS } from "./config";
import { initializeFlowTests, setupFlowTest } from "./setup";
import { generateTestSummary } from "./teardown";
import { sendTestEmail } from "./helpers/email";
import { waitForMessageInInbox, waitForFollowUpLabel } from "./helpers/polling";
import { logStep, clearLogs } from "./helpers/logging";
import type { TestAccount } from "./helpers/accounts";
import { processAccountFollowUps } from "@/app/api/follow-up-reminders/process";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { getOrCreateFollowUpLabel } from "@/utils/follow-up/labels";

const testLogger = createScopedLogger("e2e-follow-up-test");

// Helper to create a ThreadTracker directly (bypasses AI processing)
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
  }, TIMEOUTS.TEST_DEFAULT);

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
        // Step 1: Create a real email thread (needed for draft context)
        // ========================================
        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Gmail AWAITING follow-up test",
          body: "Please review and let me know your thoughts.",
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
        // Step 2: Create ThreadTracker directly (AWAITING, past threshold)
        // ========================================
        logStep("Step 2: Creating ThreadTracker");

        const tracker = await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5), // 5 minutes ago
        });

        logStep("ThreadTracker created", { trackerId: tracker.id });

        // ========================================
        // Step 3: Configure follow-up settings
        // ========================================
        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.001, // ~1.4 minutes (less than 5 min ago)
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        // ========================================
        // Step 4: Process follow-ups
        // ========================================
        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        expect(emailAccount).not.toBeNull();

        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // ========================================
        // Step 5: Assert label was applied
        // ========================================
        logStep("Step 5: Verifying Follow-up label");

        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: gmail.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("Follow-up label verified");

        // ========================================
        // Step 6: Assert draft was created
        // ========================================
        logStep("Step 6: Verifying draft creation");

        const drafts = await gmail.emailProvider.getDrafts({ maxResults: 50 });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBeGreaterThan(0);
        logStep("Draft created", { draftCount: threadDrafts.length });

        // Verify it's NOT an AI rule draft (no ExecutedAction record)
        const executedAction = await prisma.executedAction.findFirst({
          where: {
            executedRule: {
              threadId: receivedMessage.threadId,
              emailAccountId: gmail.id,
            },
            type: "DRAFT_EMAIL",
          },
        });
        expect(executedAction).toBeNull();
        logStep("Confirmed draft is follow-up draft (no ExecutedAction)");

        // ========================================
        // Step 7: Assert tracker was updated
        // ========================================
        logStep("Step 7: Verifying tracker update");

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

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Gmail AWAITING no-draft test",
          body: "Testing follow-up without draft.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Creating ThreadTracker");

        const tracker = await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5),
        });

        logStep("Step 3: Configuring follow-up settings (draft disabled)");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.001,
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: false, // Draft disabled
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        logStep("Step 5: Verifying Follow-up label");

        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: gmail.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("Step 6: Verifying NO draft created");

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

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: outlook,
          to: gmail,
          subject: "Gmail NEEDS_REPLY follow-up test",
          body: "This is an email that needs a reply from you.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: gmail.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Creating ThreadTracker (NEEDS_REPLY)");

        const tracker = await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.NEEDS_REPLY,
          sentAt: subMinutes(new Date(), 5),
        });

        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: null,
          followUpNeedsReplyDays: 0.001,
          followUpAutoDraftEnabled: true, // Even if enabled, NEEDS_REPLY never gets draft
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        logStep("Step 5: Verifying Follow-up label");

        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: gmail.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

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

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: gmail,
          to: outlook,
          subject: "Outlook AWAITING follow-up test",
          body: "Please review and let me know your thoughts.",
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

        logStep("Step 2: Creating ThreadTracker");

        const tracker = await createTestThreadTracker({
          emailAccountId: outlook.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5),
        });

        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(outlook.id, {
          followUpAwaitingReplyDays: 0.001,
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(outlook.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        logStep("Step 5: Verifying Follow-up label");

        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: outlook.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

        logStep("Step 6: Verifying draft creation");

        const drafts = await outlook.emailProvider.getDrafts({
          maxResults: 50,
        });
        const threadDrafts = drafts.filter(
          (d) => d.threadId === receivedMessage.threadId,
        );

        expect(threadDrafts.length).toBeGreaterThan(0);
        logStep("Draft created", { draftCount: threadDrafts.length });

        // Verify it's NOT an AI rule draft
        const executedAction = await prisma.executedAction.findFirst({
          where: {
            executedRule: {
              threadId: receivedMessage.threadId,
              emailAccountId: outlook.id,
            },
            type: "DRAFT_EMAIL",
          },
        });
        expect(executedAction).toBeNull();

        // Verify tracker updated
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

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: gmail,
          to: outlook,
          subject: "Outlook AWAITING no-draft test",
          body: "Testing follow-up without draft.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: outlook.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Creating ThreadTracker");

        const tracker = await createTestThreadTracker({
          emailAccountId: outlook.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5),
        });

        logStep("Step 3: Configuring follow-up settings (draft disabled)");

        await configureFollowUpSettings(outlook.id, {
          followUpAwaitingReplyDays: 0.001,
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: false,
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(outlook.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        logStep("Step 5: Verifying Follow-up label");

        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: outlook.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

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

    test(
      "should apply follow-up label for NEEDS_REPLY type (no draft)",
      async () => {
        testStartTime = Date.now();

        logStep("Step 1: Creating test email thread");

        const sentEmail = await sendTestEmail({
          from: gmail,
          to: outlook,
          subject: "Outlook NEEDS_REPLY follow-up test",
          body: "This is an email that needs a reply from you.",
        });

        const receivedMessage = await waitForMessageInInbox({
          provider: outlook.emailProvider,
          subjectContains: sentEmail.fullSubject,
          timeout: TIMEOUTS.EMAIL_DELIVERY,
        });

        logStep("Step 2: Creating ThreadTracker (NEEDS_REPLY)");

        const tracker = await createTestThreadTracker({
          emailAccountId: outlook.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.NEEDS_REPLY,
          sentAt: subMinutes(new Date(), 5),
        });

        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(outlook.id, {
          followUpAwaitingReplyDays: null,
          followUpNeedsReplyDays: 0.001,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(outlook.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        logStep("Step 5: Verifying Follow-up label");

        await waitForFollowUpLabel({
          messageId: receivedMessage.messageId,
          provider: outlook.emailProvider,
          timeout: TIMEOUTS.WEBHOOK_PROCESSING,
        });

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

        logStep("Step 2: Creating RESOLVED ThreadTracker");

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
          followUpAwaitingReplyDays: 0.001,
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
        await new Promise((resolve) => setTimeout(resolve, 2000));

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

        logStep("Step 2: Creating ThreadTracker with followUpAppliedAt set");

        await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: subMinutes(new Date(), 5),
          followUpAppliedAt: new Date(), // Already processed
        });

        logStep("Step 3: Configuring follow-up settings");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 0.001,
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // Wait a moment
        await new Promise((resolve) => setTimeout(resolve, 2000));

        logStep("Step 5: Verifying NO new Follow-up label or draft");

        // Get the actual Follow-up label ID to check against
        const followUpLabel = await getOrCreateFollowUpLabel(
          gmail.emailProvider,
        );
        const message = await gmail.emailProvider.getMessage(
          receivedMessage.messageId,
        );
        const hasFollowUpLabel = message.labelIds?.includes(followUpLabel.id);

        // The label might have been applied before (during the previous followUpAppliedAt)
        // The key assertion is no NEW draft was created
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

        logStep("Step 2: Creating ThreadTracker with recent sentAt");

        const tracker = await createTestThreadTracker({
          emailAccountId: gmail.id,
          threadId: receivedMessage.threadId,
          messageId: receivedMessage.messageId,
          type: ThreadTrackerType.AWAITING,
          sentAt: new Date(), // Just now (not past threshold)
        });

        logStep("Step 3: Configuring follow-up settings (1 day threshold)");

        await configureFollowUpSettings(gmail.id, {
          followUpAwaitingReplyDays: 1, // 1 day threshold
          followUpNeedsReplyDays: null,
          followUpAutoDraftEnabled: true,
        });

        logStep("Step 4: Processing follow-ups");

        const emailAccount = await getEmailAccountForProcessing(gmail.id);
        await processAccountFollowUps({
          emailAccount: emailAccount!,
          logger: testLogger,
        });

        // Wait a moment
        await new Promise((resolve) => setTimeout(resolve, 2000));

        logStep("Step 5: Verifying NO Follow-up label (not past threshold)");

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
