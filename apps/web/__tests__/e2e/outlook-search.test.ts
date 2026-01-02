/**
 * E2E tests focusing on Outlook search behaviour with special characters
 *
 * Usage:
 * pnpm test-e2e outlook-search
 *
 * Required env vars:
 * - RUN_E2E_TESTS=true
 * - TEST_OUTLOOK_EMAIL=<your outlook email>
 */

import { beforeAll, describe, expect, test, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { createTestLogger } from "../helpers";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)("Outlook Search Edge Cases", () => {
  let provider: EmailProvider | undefined;

  beforeAll(async () => {
    if (!TEST_OUTLOOK_EMAIL) {
      console.warn(
        "\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests (Outlook search)",
      );
      console.warn(
        "   Example: TEST_OUTLOOK_EMAIL=your@email.com pnpm test-e2e outlook-search\n",
      );
      return;
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: TEST_OUTLOOK_EMAIL,
        account: {
          provider: "microsoft",
        },
      },
      include: {
        account: true,
      },
    });

    if (!emailAccount) {
      throw new Error(`No Outlook account found for ${TEST_OUTLOOK_EMAIL}`);
    }

    provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "microsoft",
      logger: createTestLogger(),
    });

    console.log(`\n✅ Using account for search tests: ${emailAccount.email}`);
  });

  test("should handle search queries containing a question mark", async () => {
    if (!provider) {
      throw new Error(
        "Email provider not initialized. Did you set TEST_OUTLOOK_EMAIL?",
      );
    }

    const query = "can we meet tomorrow?";

    await expect(
      provider.getMessagesWithPagination({
        query,
        maxResults: 5,
      }),
    ).resolves.toHaveProperty("messages");
  }, 30_000);
});
