/**
 * E2E test to verify our Outlook draft implementation doesn't mark emails as read
 *
 * Microsoft Graph's createReplyAll endpoint has an undocumented side effect:
 * it marks the original message as read. Our implementation works around this
 * by restoring the original read status after creating the draft.
 *
 * Usage: pnpm test-e2e outlook-draft-read-status
 * Make sure TEST_OUTLOOK_EMAIL=you@email.com is set in .env.test
 */

import { beforeAll, describe, expect, test, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { findOldMessage } from "@/__tests__/e2e/helpers";
import type { EmailProvider } from "@/utils/email/types";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)(
  "Outlook Draft Read Status Preservation",
  () => {
    let provider: EmailProvider;
    let emailAccountEmail: string;

    beforeAll(async () => {
      if (!TEST_OUTLOOK_EMAIL) {
        console.warn("Set TEST_OUTLOOK_EMAIL env var to run these tests");
        return;
      }

      const emailAccount = await prisma.emailAccount.findFirst({
        where: {
          email: TEST_OUTLOOK_EMAIL,
          account: { provider: "microsoft" },
        },
        include: { account: true },
      });

      if (!emailAccount) {
        throw new Error(`No Outlook account found for ${TEST_OUTLOOK_EMAIL}`);
      }

      provider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "microsoft",
      });

      emailAccountEmail = emailAccount.email;
    });

    test("should preserve unread status when creating draft reply", async () => {
      if (!provider) {
        throw new Error("Email provider not initialized");
      }

      const testMessage = await findOldMessage(provider, 7);
      const originalMessage = await provider.getMessage(testMessage.messageId);
      const wasOriginallyUnread =
        originalMessage.labelIds?.includes("UNREAD") ?? false;

      let draftId: string | undefined;

      try {
        // Mark as unread for the test
        await provider.markReadThread(testMessage.threadId, false);

        // Verify unread status before creating draft
        const beforeDraft = await provider.getMessage(testMessage.messageId);
        expect(beforeDraft.labelIds).toContain("UNREAD");

        // Create draft reply - our implementation should NOT mark the original as read
        const draftResult = await provider.draftEmail(
          beforeDraft,
          { content: "Test draft for read status verification" },
          emailAccountEmail,
        );
        draftId = draftResult.draftId;

        // Message should still be unread after draft creation
        const afterDraft = await provider.getMessage(testMessage.messageId);
        expect(afterDraft.labelIds).toContain("UNREAD");
      } finally {
        // Cleanup: restore original state
        if (draftId) {
          await provider.deleteDraft(draftId);
        }
        await provider.markReadThread(
          testMessage.threadId,
          !wasOriginallyUnread,
        );
      }
    }, 30_000);
  },
);
