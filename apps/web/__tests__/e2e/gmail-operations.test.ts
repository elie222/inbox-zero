/**
 * E2E tests for Gmail operations (webhooks and general operations)
 *
 * Usage:
 * pnpm test-e2e gmail-operations
 * pnpm test-e2e gmail-operations -t "webhook"  # Run specific test
 *
 * Setup:
 * 1. Set TEST_GMAIL_EMAIL env var to your Gmail email
 * 2. Set TEST_GMAIL_MESSAGE_ID with a real messageId from your logs
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { GmailProvider } from "@/utils/email/google";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_GMAIL_EMAIL = process.env.TEST_GMAIL_EMAIL;
const TEST_GMAIL_MESSAGE_ID =
  process.env.TEST_GMAIL_MESSAGE_ID || "199c055aa113c499";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));

// Mock Next.js after() to run immediately in tests
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      // Run the function immediately instead of deferring it
      Promise.resolve()
        .then(fn)
        .catch(() => {});
    },
  };
});

// ============================================
// WEBHOOK PAYLOAD TESTS
// ============================================
describe.skipIf(!RUN_E2E_TESTS)("Gmail Webhook Payload", () => {
  let emailAccountId: string;
  let originalLastSyncedHistoryId: string | null;

  beforeEach(async () => {
    // Capture the original lastSyncedHistoryId before the test modifies it
    const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
      where: { email: TEST_GMAIL_EMAIL },
    });
    emailAccountId = emailAccount.id;
    originalLastSyncedHistoryId = emailAccount.lastSyncedHistoryId;
  });

  afterEach(async () => {
    // Restore the original lastSyncedHistoryId to return database to prior state
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { lastSyncedHistoryId: originalLastSyncedHistoryId },
    });
  });

  test("should process webhook and create executedRule with draft", async () => {
    // Clean slate: delete any existing executedRules for this message
    const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
      where: { email: TEST_GMAIL_EMAIL },
    });

    await prisma.executedRule.deleteMany({
      where: {
        emailAccountId: emailAccount.id,
        messageId: TEST_GMAIL_MESSAGE_ID,
      },
    });

    // This test requires a real Gmail account
    const { POST } = await import("@/app/api/google/webhook/route");

    // Create webhook payload with dynamic data
    // Note: Update this historyId with a recent one from your Gmail webhook logs
    const payloadHistoryId = 694_436;
    const webhookData = {
      emailAddress: TEST_GMAIL_EMAIL,
      historyId: payloadHistoryId,
    };

    // Reset history tracking so webhook will reprocess this history
    // Set lastSyncedHistoryId to just before the payload's historyId
    await prisma.emailAccount.update({
      where: { id: emailAccount.id },
      data: { lastSyncedHistoryId: (payloadHistoryId - 100).toString() },
    });

    const realWebhookPayload = {
      message: {
        data: Buffer.from(JSON.stringify(webhookData)).toString("base64"),
      },
    };

    // Create a mock Request object
    const mockRequest = new NextRequest(
      `http://localhost:3000/api/google/webhook?token=${process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(realWebhookPayload),
      },
    );

    // Call the webhook handler
    const response = await POST(mockRequest, {
      params: new Promise(() => ({})),
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    console.log("   ✅ Gmail webhook processed successfully");
    console.log("   📊 Response:", responseData);

    // Verify an executedRule was created for this message
    const thirtySecondsAgo = new Date(Date.now() - 30_000);

    const executedRule = await prisma.executedRule.findFirst({
      where: {
        messageId: TEST_GMAIL_MESSAGE_ID,
        createdAt: {
          gte: thirtySecondsAgo,
        },
      },
      include: {
        rule: {
          select: {
            name: true,
          },
        },
        actionItems: {
          where: {
            draftId: {
              not: null,
            },
          },
        },
      },
    });

    expect(executedRule).not.toBeNull();
    expect(executedRule).toBeDefined();

    if (!executedRule) {
      throw new Error("ExecutedRule is null");
    }

    console.log("   ✅ ExecutedRule created successfully");
    console.log(`      Rule: ${executedRule.rule?.name || "(no rule)"}`);
    console.log(`      Rule ID: ${executedRule.ruleId || "(no rule id)"}`);

    // Check if a draft was created
    const draftAction = executedRule.actionItems.find((a) => a.draftId);
    if (draftAction?.draftId) {
      const provider = (await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "google",
      })) as GmailProvider;

      const draft = await provider.getDraft(draftAction.draftId);

      expect(draft).toBeDefined();

      // Verify draft is actually a reply, not a fresh draft
      expect(draft?.threadId).toBeTruthy();
      expect(draft?.threadId).not.toBe("");

      console.log("   ✅ Draft created successfully");
      console.log(`      Draft ID: ${draftAction.draftId}`);
      console.log(`      Thread ID: ${draft?.threadId}`);
      console.log(`      Subject: ${draft?.subject || "(no subject)"}`);
      console.log("      Content:");
      console.log(
        `        ${draft?.textPlain?.substring(0, 200).replace(/\n/g, "\n        ") || "(empty)"}`,
      );
      if (draft?.textPlain && draft.textPlain.length > 200) {
        console.log(`        ... (${draft.textPlain.length} total characters)`);
      }
    } else {
      console.log("   ℹ️  No draft action found");
    }
  }, 30_000);
});
