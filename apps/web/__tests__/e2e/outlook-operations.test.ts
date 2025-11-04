/**
 * E2E tests for Outlook operations (webhooks, threads, search queries)
 *
 * Usage:
 * pnpm test-e2e outlook-operations
 * pnpm test-e2e outlook-operations -t "getThread"  # Run specific test
 *
 * Setup:
 * 1. Set TEST_OUTLOOK_EMAIL env var to your Outlook email
 * 2. Set TEST_OUTLOOK_MESSAGE_ID with a real messageId from your logs (optional)
 * 3. Set TEST_CONVERSATION_ID with a real conversationId from your logs (optional)
 * 4. Set TEST_CATEGORY_NAME for category/label testing (optional, defaults to "To Reply")
 */

import { describe, test, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookProvider } from "@/utils/email/microsoft";
import { webhookBodySchema } from "@/app/api/outlook/webhook/types";
import { findOldMessage } from "@/__tests__/e2e/helpers";
import { sleep } from "@/utils/sleep";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;
const TEST_CONVERSATION_ID =
  process.env.TEST_CONVERSATION_ID ||
  "AQQkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoAEABuo-fmt9KvQ4u55KlWB32H"; // Real conversation ID from demoinboxzero@outlook.com
const TEST_CATEGORY_NAME = process.env.TEST_CATEGORY_NAME || "To Reply";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));

// Mock Next.js after() to run synchronously and await in tests
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: async (fn: () => void | Promise<void>) => {
      await fn();
    },
  };
});

describe.skipIf(!RUN_E2E_TESTS)("Outlook Operations Integration Tests", () => {
  let provider: OutlookProvider;

  beforeAll(async () => {
    const testEmail = TEST_OUTLOOK_EMAIL;

    if (!testEmail) {
      console.warn("\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests");
      console.warn(
        "   Example: TEST_OUTLOOK_EMAIL=your@email.com pnpm test-e2e outlook-operations\n",
      );
      return;
    }

    // Load account from DB
    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: testEmail,
        account: {
          provider: "microsoft",
        },
      },
      include: {
        account: true,
      },
    });

    if (!emailAccount) {
      throw new Error(`No Outlook account found for ${testEmail}`);
    }

    provider = (await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "microsoft",
    })) as OutlookProvider;

    console.log(`\n✅ Using account: ${emailAccount.email}`);
    console.log(`   Account ID: ${emailAccount.id}`);
    console.log(`   Test conversation ID: ${TEST_CONVERSATION_ID}\n`);
  });

  describe("getThread", () => {
    test("should fetch messages by conversationId", async () => {
      const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);

      if (messages.length > 0) {
        console.log(`   ✅ Got ${messages.length} messages`);
        console.log(
          `   First message: ${messages[0].subject || "(no subject)"}`,
        );
        expect(messages[0]).toHaveProperty("id");
        expect(messages[0]).toHaveProperty("subject");
      } else {
        console.log(
          "   ℹ️  No messages found (may be expected if conversationId is old)",
        );
      }
    });

    test("should handle conversationId with special characters", async () => {
      // Conversation IDs can contain base64-like characters including -, _, and sometimes =
      // Test that these don't cause URL encoding issues
      const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);
      console.log(
        `   ✅ Handled conversationId with special characters (${TEST_CONVERSATION_ID.slice(0, 20)}...)`,
      );
    });
  });

  describe("Sender queries", () => {
    test("getMessagesFromSender should resolve without error (current bug: fails)", async () => {
      const sender = "aibreakfast@mail.beehiiv.com";
      await expect(
        provider.getMessagesFromSender({ senderEmail: sender, maxResults: 5 }),
      ).resolves.toHaveProperty("messages");
    }, 30_000);
  });

  describe("removeThreadLabel", () => {
    test("should add and remove category from thread messages", async () => {
      // Get or create the category
      let label = await provider.getLabelByName(TEST_CATEGORY_NAME);

      if (!label) {
        console.log(
          `   📝 Category "${TEST_CATEGORY_NAME}" doesn't exist, creating it`,
        );
        label = await provider.createLabel(TEST_CATEGORY_NAME);
      }

      console.log(`   📝 Using category: ${label.name} (ID: ${label.id})`);

      // Get the thread messages
      const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);
      if (messages.length === 0) {
        console.log("   ⚠️  No messages in thread, skipping test");
        return;
      }

      const firstMessage = messages[0];

      // Add the category to the message
      await provider.labelMessage({
        messageId: firstMessage.id,
        labelId: label.id,
        labelName: null,
      });
      console.log("   ✅ Added category to message");

      // Now remove the category from the thread
      await provider.removeThreadLabel(TEST_CONVERSATION_ID, label.id);
      console.log("   ✅ Removed category from thread");
    });

    test("should handle empty category name gracefully", async () => {
      await expect(
        provider.removeThreadLabel(TEST_CONVERSATION_ID, ""),
      ).resolves.not.toThrow();

      console.log("   ✅ Handled empty category name");
    });
  });

  describe("Label operations", () => {
    test("should list all categories", async () => {
      const labels = await provider.getLabels();

      expect(labels).toBeDefined();
      expect(Array.isArray(labels)).toBe(true);
      expect(labels.length).toBeGreaterThan(0);

      console.log(`   ✅ Found ${labels.length} categories`);
      labels.slice(0, 3).forEach((label) => {
        console.log(`      - ${label.name}`);
      });
    });

    test("should create a new label", async () => {
      const testLabelName = `Test Label ${Date.now()}`;
      const newLabel = await provider.createLabel(testLabelName);

      expect(newLabel).toBeDefined();
      expect(newLabel.id).toBeDefined();
      expect(newLabel.name).toBe(testLabelName);

      console.log(`   ✅ Created label: ${testLabelName}`);
      console.log(`      ID: ${newLabel.id}`);
      console.log("      (You may want to delete this test label manually)");
    });

    test("should get label by name", async () => {
      const label = await provider.getLabelByName(TEST_CATEGORY_NAME);

      if (label) {
        expect(label).toBeDefined();
        expect(label.name).toBe(TEST_CATEGORY_NAME);
        expect(label.id).toBeDefined();
        console.log(`   ✅ Found label: ${label.name} (ID: ${label.id})`);
      } else {
        console.log(`   ℹ️  Label "${TEST_CATEGORY_NAME}" not found`);
      }
    });
  });

  describe("Thread messages", () => {
    test("should get thread messages", async () => {
      const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);

      if (messages.length > 0) {
        console.log(`   ✅ Got ${messages.length} messages`);
        expect(messages[0]).toHaveProperty("threadId");
        expect(messages[0].threadId).toBe(TEST_CONVERSATION_ID);
      }
    });
  });

  describe("Search queries", () => {
    test("should handle search queries with colons", async () => {
      // Known issue: Outlook search doesn't support "field:" syntax like Gmail
      // The query "subject:lunch tomorrow?" causes:
      // "Syntax error: character ':' is not valid at position 7"
      // Instead, Outlook uses KQL syntax or plain text search

      const invalidQuery = "subject:lunch tomorrow?";
      const validQuery = "lunch tomorrow"; // Plain text search

      // Test that invalid query throws an error
      await expect(
        provider.getMessagesWithPagination({
          query: invalidQuery,
          maxResults: 10,
        }),
      ).rejects.toThrow();

      // Test that valid query works
      const result = await provider.getMessagesWithPagination({
        query: validQuery,
        maxResults: 10,
      });
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      console.log(
        `   ✅ Plain text search returned ${result.messages.length} messages`,
      );
    });

    test("should handle special characters in search queries", async () => {
      // Test various special characters
      // Note: Outlook KQL has restrictions - some chars like ? and : cause syntax errors
      const validQueries = [
        "lunch tomorrow", // Plain text (should work)
        "test example", // Multiple words (should work)
      ];

      const invalidQueries = [
        "meeting?", // Question mark causes syntax error
        "test:query", // Colon causes syntax error
      ];

      // Test valid queries
      for (const query of validQueries) {
        const result = await provider.getMessagesWithPagination({
          query,
          maxResults: 5,
        });
        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ Query "${query}" returned ${result.messages.length} messages`,
        );
      }

      // Test that invalid queries throw errors
      for (const query of invalidQueries) {
        await expect(
          provider.getMessagesWithPagination({
            query,
            maxResults: 5,
          }),
        ).rejects.toThrow();
        console.log(`   ✅ Query "${query}" correctly threw an error`);
      }
    });
  });
});

// ============================================
// WEBHOOK PAYLOAD TESTS
// ============================================
describe.skipIf(!RUN_E2E_TESTS)("Outlook Webhook Payload", () => {
  test("should validate real webhook payload structure", () => {
    const realWebhookPayload = {
      value: [
        {
          subscriptionId: "d2d593e1-9600-4f72-8cd3-dfa04c707f9e",
          subscriptionExpirationDateTime: "2025-10-09T15:32:19.8+00:00",
          changeType: "updated",
          resource:
            "Users/faa95128258c6335/Messages/AQMkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoARgAAA-ybH4V64nRKkgXhv9H-GEkHAP38WoVoPXRMilGF27prOB8AAAIBDAAAAP38WoVoPXRMilGF27prOB8AAABGAqbwAAAA",
          resourceData: {
            "@odata.type": "#Microsoft.Graph.Message",
            "@odata.id":
              "Users/faa95128258c6335/Messages/AQMkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoARgAAA-ybH4V64nRKkgXhv9H-GEkHAP38WoVoPXRMilGF27prOB8AAAIBDAAAAP38WoVoPXRMilGF27prOB8AAABGAqbwAAAA",
            "@odata.etag": 'W/"CQAAABYAAAD9/FqFaD10TIpRhdu6azgfAABF+9hk"',
            id: "AQMkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoARgAAA-ybH4V64nRKkgXhv9H-GEkHAP38WoVoPXRMilGF27prOB8AAAIBDAAAAP38WoVoPXRMilGF27prOB8AAABGAqbwAAAA",
          },
          clientState: "05338492cb69f2facfe870450308f802",
          tenantId: "",
        },
      ],
    };

    // Validate against our schema
    const result = webhookBodySchema.safeParse(realWebhookPayload);

    expect(result.success).toBe(true);
  });

  test("should process webhook and fetch conversationId from message", async () => {
    const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
      where: { email: TEST_OUTLOOK_EMAIL },
    });

    const provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "microsoft",
    });

    const testMessage = await findOldMessage(provider, 7);

    const MOCK_SUBSCRIPTION_ID = "d2d593e1-9600-4f72-8cd3-dfa04c707f9e";

    await prisma.emailAccount.update({
      where: { id: emailAccount.id },
      data: { watchEmailsSubscriptionId: MOCK_SUBSCRIPTION_ID },
    });

    // Make the account premium for testing
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: emailAccount.userId },
      include: { premium: true },
    });

    // Clear any existing aiApiKey to use env defaults
    await prisma.user.update({
      where: { id: user.id },
      data: { aiApiKey: null },
    });

    if (!user.premium) {
      const premium = await prisma.premium.create({
        data: {
          tier: "BUSINESS_MONTHLY",
          stripeSubscriptionStatus: "active",
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { premiumId: premium.id },
      });
    } else {
      await prisma.premium.update({
        where: { id: user.premium.id },
        data: {
          stripeSubscriptionStatus: "active",
          tier: "BUSINESS_MONTHLY",
        },
      });
    }

    await prisma.executedRule.deleteMany({
      where: {
        emailAccountId: emailAccount.id,
        messageId: testMessage.messageId,
      },
    });

    // Ensure the user has at least one enabled rule for automation
    const existingRule = await prisma.rule.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        enabled: true,
      },
    });

    if (!existingRule) {
      await prisma.rule.create({
        data: {
          name: "Test Rule for Webhook",
          emailAccountId: emailAccount.id,
          enabled: true,
          automate: true,
          instructions: "Reply to emails about testing",
          actions: {
            create: {
              type: "DRAFT_EMAIL",
              content: "Test reply",
            },
          },
        },
      });
    }

    // This test requires a real Outlook account
    const { POST } = await import("@/app/api/outlook/webhook/route");

    const realWebhookPayload = {
      value: [
        {
          subscriptionId: MOCK_SUBSCRIPTION_ID,
          subscriptionExpirationDateTime: "2025-10-09T15:32:19.8+00:00",
          changeType: "updated",
          resource: `Users/faa95128258c6335/Messages/${testMessage.messageId}`,
          resourceData: {
            "@odata.type": "#Microsoft.Graph.Message",
            "@odata.id": `Users/faa95128258c6335/Messages/${testMessage.messageId}`,
            "@odata.etag": 'W/"CQAAABYAAAD9/FqFaD10TIpRhdu6azgfAABF+9hk"',
            id: testMessage.messageId,
          },
          clientState: process.env.MICROSOFT_WEBHOOK_CLIENT_STATE,
          tenantId: "",
        },
      ],
    };

    // Create a mock Request object
    const mockRequest = new NextRequest(
      "http://localhost:3000/api/outlook/webhook",
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

    // Verify webhook processed successfully
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData).toEqual({ ok: true });

    console.log("   ✅ Webhook processed successfully");

    // Wait for async processing to complete (after() runs async)
    await sleep(10_000);

    // Verify an executedRule was created for this message
    const thirtySecondsAgo = new Date(Date.now() - 30_000);

    const executedRule = await prisma.executedRule.findFirst({
      where: {
        messageId: testMessage.messageId,
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
      const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
        where: { email: TEST_OUTLOOK_EMAIL },
      });

      const provider = (await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "microsoft",
      })) as OutlookProvider;

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

  test("should verify draft ID can be fetched immediately after creation", async () => {
    const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
      where: { email: TEST_OUTLOOK_EMAIL },
    });

    const provider = (await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "microsoft",
    })) as OutlookProvider;

    // Get a real message to reply to
    const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);
    if (messages.length === 0) {
      console.log("   ⚠️  No messages in thread, skipping test");
      return;
    }

    const message = messages[0];

    // Create a draft
    const draftResult = await provider.draftEmail(
      message,
      { content: "Test draft - verifying ID can be fetched" },
      emailAccount.email,
    );

    expect(draftResult.draftId).toBeDefined();
    console.log(`   ✅ Created draft with ID: ${draftResult.draftId}`);

    // Immediately try to fetch the draft with the returned ID
    const fetchedDraft = await provider.getDraft(draftResult.draftId);

    expect(fetchedDraft).toBeDefined();
    expect(fetchedDraft?.id).toBe(draftResult.draftId);

    console.log("   ✅ Successfully fetched draft with same ID");
    console.log(`      Draft ID: ${draftResult.draftId}`);
    console.log(`      Fetched ID: ${fetchedDraft?.id}`);
    console.log(
      `      Content preview: ${fetchedDraft?.textPlain?.substring(0, 50) || "(empty)"}...`,
    );

    // Clean up - delete the test draft
    await provider.deleteDraft(draftResult.draftId);
    console.log("   ✅ Cleaned up test draft");

    // Try to fetch the deleted draft to see the error message
    console.log("\n   🔍 Attempting to fetch deleted draft...");
    const deletedDraft = await provider.getDraft(draftResult.draftId);

    // Should return null for deleted drafts (not throw an error)
    expect(deletedDraft).toBeNull();
    console.log("   ✅ getDraft correctly returned null for deleted draft");
  }, 30_000);
});
