import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { getCategoryOverview } from "@/utils/categorize/senders/get-category-overview";

vi.mock("@/utils/redis/categorization-progress", () => ({
  getCategorizationProgress: vi.fn(async () => null),
  getCategorizationStatusSnapshot: vi.fn(() => ({ status: "idle" })),
}));

const userId = "category-overview-test-user";
const emailAccountId = "category-overview-test-account";

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "sender category overview (real database)",
  () => {
    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.user.create({
        data: { id: userId, email: "overview-owner@example.com" },
      });
      const account = await prisma.account.create({
        data: {
          userId,
          provider: "google",
          providerAccountId: "category-overview-test",
        },
      });
      await prisma.emailAccount.create({
        data: {
          id: emailAccountId,
          email: "overview-owner@example.com",
          userId,
          accountId: account.id,
        },
      });
    });
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: userId } });
    });

    it("only counts and samples senders that still have inbox mail", async () => {
      const category = await prisma.category.create({
        data: { emailAccountId, name: "Newsletters" },
      });
      await createSender("still@example.com", category.id, [true, false]);
      await createSender("Mixed.Case@example.com", category.id, [true]);
      await createSender("archived@example.com", category.id, [false, false]);
      await createSender("never-synced@example.com", category.id, []);
      await createSender("loose@example.com", null, [true]);
      await createSender("loose-archived@example.com", null, [false]);

      const result = await getCategoryOverview({ emailAccountId });

      expect(result.categorizedSenderCount).toBe(2);
      expect(result.uncategorizedSenderCount).toBe(1);
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]).toMatchObject({
        id: category.id,
        name: "Newsletters",
        senderCount: 2,
      });
      expect(
        result.categories[0].sampleSenders.map((sender) => sender.email).sort(),
      ).toEqual(["mixed.case@example.com", "still@example.com"]);
    });

    it("keeps categories whose senders are all cleaned up, with a zero count", async () => {
      const category = await prisma.category.create({
        data: { emailAccountId, name: "Receipts" },
      });
      await createSender("done@example.com", category.id, [false]);

      const result = await getCategoryOverview({ emailAccountId });

      expect(result.categories).toEqual([
        {
          id: category.id,
          name: "Receipts",
          description: null,
          senderCount: 0,
          sampleSenders: [],
        },
      ]);
      expect(result.categorizedSenderCount).toBe(0);
    });
  },
);

async function createSender(
  email: string,
  categoryId: string | null,
  inboxFlags: boolean[],
) {
  await prisma.newsletter.create({
    data: { email: email.toLowerCase(), emailAccountId, categoryId },
  });
  await prisma.emailMessage.createMany({
    data: inboxFlags.map((inbox, index) => ({
      emailAccountId,
      threadId: `${email}-thread-${index}`,
      messageId: `${email}-message-${index}`,
      date: new Date("2026-01-01"),
      from: email,
      fromDomain: email.split("@")[1],
      to: "overview-owner@example.com",
      read: false,
      sent: false,
      draft: false,
      inbox,
    })),
  });
}
