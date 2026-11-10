import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/utils/prisma";
import { addChatActionTotals } from "@/utils/ai/assistant/chat-action-totals";

const userId = "chat-action-totals-test-user";
const accountId = "chat-action-totals-test-account";
const emailAccountId = "chat-action-totals-test-mailbox";
const chatId = "chat-action-totals-test-chat";
const otherChatId = "chat-action-totals-test-other-chat";

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "chat action totals (real database)",
  () => {
    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.user.create({
        data: { id: userId, email: "chat-action-totals@example.com" },
      });
      await prisma.account.create({
        data: {
          id: accountId,
          userId,
          provider: "google",
          providerAccountId: "chat-action-totals-subject",
        },
      });
      await prisma.emailAccount.create({
        data: {
          id: emailAccountId,
          email: "chat-action-totals@example.com",
          userId,
          accountId,
        },
      });
      await prisma.chat.createMany({
        data: [
          { id: chatId, emailAccountId },
          { id: otherChatId, emailAccountId },
        ],
      });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: userId } });
    });

    it("keeps an exact running total per action across many batches", async () => {
      for (let batch = 0; batch < 63; batch++) {
        await addChatActionTotals({
          chatId,
          counts: { threads_archived: 25 },
        });
      }
      await addChatActionTotals({
        chatId,
        counts: { threads_trashed: 12, threads_archived: 0 },
      });

      const totals = await addChatActionTotals({
        chatId,
        counts: { threads_archived: 20 },
      });

      expect(totals).toEqual({
        threads_archived: 63 * 25 + 20,
        threads_trashed: 12,
      });
    });

    it("counts parallel calls in the same chat without losing updates", async () => {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          addChatActionTotals({ chatId, counts: { threads_archived: 5 } }),
        ),
      );

      const totals = await addChatActionTotals({ chatId, counts: {} });

      expect(totals).toEqual({ threads_archived: 50 });
    });

    it("keeps totals separate per chat", async () => {
      await addChatActionTotals({ chatId, counts: { threads_archived: 7 } });

      const otherTotals = await addChatActionTotals({
        chatId: otherChatId,
        counts: { threads_marked_read: 3 },
      });

      expect(otherTotals).toEqual({ threads_marked_read: 3 });
    });
  },
);
