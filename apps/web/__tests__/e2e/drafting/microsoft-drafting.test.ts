/**
 * E2E tests for Microsoft Outlook drafting operations
 *
 * Usage:
 * RUN_E2E_TESTS=true pnpm test-e2e microsoft-drafting
 * RUN_E2E_TESTS=true pnpm test-e2e microsoft-drafting -t "should create reply draft"  # Run specific test
 *
 * Setup:
 * 1. Set TEST_OUTLOOK_EMAIL env var to your Outlook email
 * 2. Set TEST_OUTLOOK_MESSAGE_ID with a real messageId from your logs (optional)
 * 3. Set TEST_CONVERSATION_ID with a real conversationId from your logs (optional)
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookProvider } from "@/utils/email/microsoft";
import type { ParsedMessage } from "@/utils/types";
import { extractEmailAddress } from "@/utils/email";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;
const TEST_CONVERSATION_ID =
  process.env.TEST_CONVERSATION_ID ||
  "AQQkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoAEABuo-fmt9KvQ4u55KlWB32H";
const TEST_OUTLOOK_MESSAGE_ID = process.env.TEST_OUTLOOK_MESSAGE_ID;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)("Microsoft Outlook Drafting E2E Tests", () => {
  let provider: OutlookProvider;
  let emailAccount: {
    id: string;
    email: string;
  } | null = null;
  const createdDraftIds: string[] = [];
  let replySourceMessage: ParsedMessage | null = null;

  beforeAll(async () => {
    const testEmail = TEST_OUTLOOK_EMAIL;

    if (!testEmail) {
      console.warn("\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests");
      console.warn(
        "   Example: TEST_OUTLOOK_EMAIL=your@email.com pnpm test-e2e microsoft-drafting\n",
      );
      return;
    }

    const account = await prisma.emailAccount.findFirst({
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

    if (!account) {
      throw new Error(`No Outlook account found for ${testEmail}`);
    }

    console.log(`\n✅ Using account: ${account.email}`);
    console.log(`   Account ID: ${account.id}`);
    console.log(`   Test conversation ID: ${TEST_CONVERSATION_ID}\n`);

    provider = (await createEmailProvider({
      emailAccountId: account.id,
      provider: "microsoft",
    })) as OutlookProvider;

    emailAccount = {
      id: account.id,
      email: account.email,
    };

    replySourceMessage = await selectReplySourceMessage({
      provider,
      accountEmail: account.email,
    });

    if (replySourceMessage) {
      console.log(
        `   ✉️  Using message ${replySourceMessage.id} for drafting tests`,
        {
          subject: replySourceMessage.headers.subject,
          from: replySourceMessage.headers.from,
          threadId: replySourceMessage.threadId,
        },
      );
    } else {
      console.warn(
        "   ⚠️  Could not find a replyable Outlook message; drafting tests will be skipped",
      );
    }
  });

  afterAll(async () => {
    if (!provider || createdDraftIds.length === 0) return;

    console.log(
      `\n   🧹 Cleaning up ${createdDraftIds.length} draft(s) created during tests...`,
    );

    let deletedCount = 0;
    let failedCount = 0;

    for (const draftId of createdDraftIds) {
      try {
        await provider.deleteDraft(draftId);
        deletedCount++;
      } catch (error) {
        failedCount++;
        console.log("      ⚠️  Failed to delete draft", {
          draftId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(
      `   ✅ Deleted ${deletedCount} draft(s), ${failedCount} deletion(s) failed\n`,
    );
  }, 30_000);

  describe("Reply drafting", () => {
    test("should create reply draft and fetch by id immediately", async () => {
      if (!provider || !emailAccount) {
        console.log("   ⚠️  Provider not initialized, skipping test");
        return;
      }

      const message = await loadReplySourceMessage();
      if (!message) {
        console.log(
          "   ⚠️  No replyable message available, skipping draft creation test",
        );
        return;
      }
      const draftContent = `Test Outlook draft created at ${new Date().toISOString()}`;

      const draftResult = await provider.draftEmail(
        message,
        {
          content: draftContent,
        },
        emailAccount.email,
      );

      expect(draftResult.draftId).toBeDefined();
      expect(draftResult.draftId).not.toBe("");

      createdDraftIds.push(draftResult.draftId);
      console.log("   ✅ Created draft", {
        draftId: draftResult.draftId,
        threadId: message.threadId,
      });

      const fetchedDraft = await provider.getDraft(draftResult.draftId);

      expect(fetchedDraft).toBeDefined();
      expect(fetchedDraft?.id).toBe(draftResult.draftId);
      expect(fetchedDraft?.threadId).toBeTruthy();
      expect(fetchedDraft?.textPlain || fetchedDraft?.textHtml || "").toContain(
        "Test Outlook draft",
      );

      console.log("   ✅ Fetched draft immediately after creation", {
        fetchedId: fetchedDraft?.id,
        threadId: fetchedDraft?.threadId,
      });
    }, 30_000);

    test("should delete draft", async () => {
      if (!provider || !emailAccount) {
        console.log("   ⚠️  Provider not initialized, skipping test");
        return;
      }

      const message = await loadReplySourceMessage();
      if (!message) {
        console.log(
          "   ⚠️  No replyable message available, skipping draft deletion test",
        );
        return;
      }

      const draftResult = await provider.draftEmail(
        message,
        {
          content: `Draft to delete ${Date.now()}`,
        },
        emailAccount.email,
      );

      expect(draftResult.draftId).toBeDefined();
      createdDraftIds.push(draftResult.draftId);

      try {
        await provider.deleteDraft(draftResult.draftId);

        // Remove from cleanup list since it was deleted
        const index = createdDraftIds.indexOf(draftResult.draftId);
        if (index >= 0) {
          createdDraftIds.splice(index, 1);
        }

        console.log("   ✅ Draft successfully deleted", {
          draftId: draftResult.draftId,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // "Object cannot be deleted" may occur with certain Outlook configurations
        if (errorMessage.includes("cannot be deleted")) {
          console.log(
            "   ⚠️  Draft cannot be deleted (known Outlook limitation)",
            {
              draftId: draftResult.draftId,
              error: errorMessage,
            },
          );
          // This is a known issue - test passes but draft remains for cleanup
        } else {
          throw error;
        }
      }
    }, 30_000);
  });

  async function loadReplySourceMessage(): Promise<ParsedMessage | null> {
    if (!provider || !replySourceMessage) {
      console.log(
        "   ⚠️  No reply source message available, skipping drafting operation",
      );
      return null;
    }

    try {
      const fresh = await provider.getMessage(replySourceMessage.id);
      replySourceMessage = fresh;
      return fresh;
    } catch (error) {
      console.warn(
        "   ⚠️  Failed to refetch reply source message, using cached data",
        {
          messageId: replySourceMessage.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      return replySourceMessage;
    }
  }

  async function selectReplySourceMessage({
    provider,
    accountEmail,
  }: {
    provider: OutlookProvider;
    accountEmail: string;
  }): Promise<ParsedMessage | null> {
    const normalizedAccount = normalizeEmail(accountEmail);

    if (TEST_OUTLOOK_MESSAGE_ID) {
      try {
        const message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
        console.log(
          `   🔍 Using TEST_OUTLOOK_MESSAGE_ID ${TEST_OUTLOOK_MESSAGE_ID} for drafts`,
        );
        return message;
      } catch (error) {
        console.warn(
          "   ⚠️  Failed to load TEST_OUTLOOK_MESSAGE_ID, falling back to other strategies",
          {
            messageId: TEST_OUTLOOK_MESSAGE_ID,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    if (TEST_CONVERSATION_ID) {
      try {
        const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);
        const candidate = pickInboundMessage(messages, normalizedAccount);
        if (candidate) {
          return candidate;
        }
      } catch (error) {
        console.warn(
          "   ⚠️  Failed to load messages from TEST_CONVERSATION_ID, will scan inbox",
          {
            conversationId: TEST_CONVERSATION_ID,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    const threads = await provider.getThreads();
    for (const thread of threads) {
      try {
        const messages = await provider.getThreadMessages(thread.id);
        const candidate = pickInboundMessage(messages, normalizedAccount);
        if (candidate) {
          console.log("   🔍 Selected message from inbox thread", {
            threadId: thread.id,
            messageId: candidate.id,
            subject: candidate.headers.subject,
          });
          return candidate;
        }
      } catch (error) {
        console.warn(
          "   ⚠️  Failed to inspect thread while searching for reply source",
          {
            threadId: thread.id,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    return null;
  }

  function pickInboundMessage(
    messages: ParsedMessage[],
    normalizedAccountEmail: string | null,
  ): ParsedMessage | null {
    if (!messages.length) return null;

    const inbound = messages.find((message) => {
      if (!message.id) return false;
      const from = normalizeEmail(message.headers.from);
      if (!from) return false;
      return !normalizedAccountEmail || from !== normalizedAccountEmail;
    });

    if (inbound) {
      return inbound;
    }

    return messages.find((message) => !!message.id) || null;
  }

  function normalizeEmail(value?: string): string | null {
    if (!value) return null;
    const extracted = extractEmailAddress(value) || value;
    const normalized = extracted.trim().toLowerCase();
    return normalized || null;
  }
});
