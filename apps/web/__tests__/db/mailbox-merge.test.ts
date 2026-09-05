import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { mergeAccount } from "@/utils/user/merge-account";
import { transferPremiumDuringMerge } from "@/utils/user/merge-premium";

vi.mock("@/utils/user/merge-premium", () => ({
  transferPremiumDuringMerge: vi.fn(),
}));
vi.mock("@/utils/redis/account-validation", () => ({
  invalidateAccountValidation: vi.fn(),
}));

const sourceUserId = "mailbox-merge-db-source";
const targetUserId = "mailbox-merge-db-target";
const logger = createScopedLogger("mailbox-merge-test");

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "mailbox merging (real database)",
  () => {
    beforeEach(async () => {
      vi.resetAllMocks();
      await prisma.user.deleteMany({
        where: { id: { in: [sourceUserId, targetUserId] } },
      });
      await prisma.user.createMany({
        data: [
          { id: sourceUserId, email: "merge-source@example.com" },
          { id: targetUserId, email: "merge-target@example.com" },
        ],
      });
      await createMailbox("original", sourceUserId);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({
        where: { id: { in: [sourceUserId, targetUserId] } },
      });
    });

    it("preserves a mailbox linked after the merge reads its source account snapshot", async () => {
      vi.mocked(transferPremiumDuringMerge).mockImplementationOnce(async () => {
        await createMailbox("concurrent", sourceUserId);
      });

      await mergeAccount({
        sourceUserId,
        targetUserId,
        sourceAccountId: "mailbox-merge-original",
        email: "merge-original@example.com",
        name: null,
        logger,
      }).catch(() => undefined);

      expect(
        await prisma.emailAccount.findUnique({
          where: { email: "merge-concurrent@example.com" },
        }),
      ).toMatchObject({ userId: sourceUserId });
      expect(
        await prisma.account.findUnique({
          where: { id: "mailbox-merge-original" },
        }),
      ).toMatchObject({ userId: sourceUserId });
      expect(
        await prisma.emailAccount.findUnique({
          where: { email: "merge-original@example.com" },
        }),
      ).toMatchObject({ userId: sourceUserId });
      expect(
        await prisma.user.findUnique({ where: { id: sourceUserId } }),
      ).not.toBeNull();
    });

    it("waits for an in-flight mailbox link before checking whether the source can be deleted", {
      timeout: 15_000,
    }, async () => {
      const connection = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await connection.connect();
      const { promise: linked, resolve: signalLinked } =
        Promise.withResolvers<void>();
      vi.mocked(transferPremiumDuringMerge).mockImplementationOnce(async () => {
        await connection.query("BEGIN");
        await connection.query(
          'INSERT INTO "Account" (id, "userId", provider, "providerAccountId", "updatedAt") VALUES ($1, $2, $3, $1, NOW())',
          ["mailbox-merge-inflight", sourceUserId, "google"],
        );
        await connection.query(
          'INSERT INTO "EmailAccount" (id, "accountId", "userId", email, "updatedAt") VALUES ($1, $1, $2, $3, NOW())',
          [
            "mailbox-merge-inflight",
            sourceUserId,
            "merge-inflight@example.com",
          ],
        );
        signalLinked();
      });
      const merging = mergeAccount({
        sourceUserId,
        targetUserId,
        sourceAccountId: "mailbox-merge-original",
        email: "merge-original@example.com",
        name: null,
        logger,
      }).catch((error: unknown) => error);
      try {
        await linked;
        await vi.waitFor(
          async () => {
            await connection.query("SELECT pg_stat_clear_snapshot()");
            const result = await connection.query(
              `SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%SELECT id FROM "User"%FOR UPDATE%'`,
            );
            expect(result.rows[0].count).toBeGreaterThan(0);
          },
          { timeout: 5000 },
        );
        await connection.query("COMMIT");
        expect(await merging).toMatchObject({ code: "P2025" });
        expect(
          await prisma.emailAccount.findUnique({
            where: { email: "merge-inflight@example.com" },
          }),
        ).toMatchObject({ userId: sourceUserId });
      } finally {
        await connection.query("ROLLBACK");
        await connection.end();
        await merging;
      }
    });

    it("still merges a source user whose only mailbox is being moved", async () => {
      await expect(
        mergeAccount({
          sourceUserId,
          targetUserId,
          sourceAccountId: "mailbox-merge-original",
          email: "merge-original@example.com",
          name: null,
          logger,
        }),
      ).resolves.toBe("full_merge");
      expect(
        await prisma.user.findUnique({ where: { id: sourceUserId } }),
      ).toBeNull();
      expect(
        await prisma.emailAccount.findUnique({
          where: { email: "merge-original@example.com" },
        }),
      ).toMatchObject({ userId: targetUserId });
    });
  },
);

async function createMailbox(suffix: string, userId: string) {
  return prisma.account.create({
    data: {
      id: `mailbox-merge-${suffix}`,
      userId,
      provider: "google",
      providerAccountId: `mailbox-merge-${suffix}`,
      emailAccount: {
        create: { userId, email: `merge-${suffix}@example.com` },
      },
    },
  });
}
