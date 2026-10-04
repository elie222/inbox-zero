import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "@/utils/prisma";

const email = "fastmail-release-test@example.com";
let emailAccountId: string;
describe.skipIf(!process.env.RUN_DB_TESTS)(
  "Fastmail durable state (PostgreSQL)",
  () => {
    beforeAll(async () => {
      const user = await prisma.user.create({ data: { email } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "fastmail",
          providerAccountId: email,
          type: "app_token",
        },
      });
      const emailAccount = await prisma.emailAccount.create({
        data: { userId: user.id, accountId: account.id, email },
      });
      emailAccountId = emailAccount.id;
    });
    beforeEach(async () => {
      await prisma.fastmailSyncItem.deleteMany({ where: { emailAccountId } });
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          fastmailLeaseOwner: null,
          fastmailLeaseUntil: null,
          lastSyncedHistoryId: "s1",
        },
      });
    });
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email } });
    });

    it("grants a lease to only one of two simultaneous workers", async () => {
      const claims = await Promise.all(
        ["one", "two"].map((owner) =>
          prisma.emailAccount.updateMany({
            where: {
              id: emailAccountId,
              OR: [
                { fastmailLeaseUntil: null },
                { fastmailLeaseUntil: { lt: new Date() } },
              ],
            },
            data: {
              fastmailLeaseOwner: owner,
              fastmailLeaseUntil: new Date(Date.now() + 60_000),
            },
          }),
        ),
      );
      expect(claims.map((claim) => claim.count).sort()).toEqual([0, 1]);
    });

    it("rolls back the cursor when durable intake fails", async () => {
      await expect(
        prisma.$transaction([
          prisma.emailAccount.update({
            where: { id: emailAccountId },
            data: { lastSyncedHistoryId: "s2" },
          }),
          prisma.fastmailSyncItem.create({
            data: { emailAccountId: "missing-account", messageId: "message" },
          }),
        ]),
      ).rejects.toThrow();
      expect(
        (
          await prisma.emailAccount.findUniqueOrThrow({
            where: { id: emailAccountId },
          })
        ).lastSyncedHistoryId,
      ).toBe("s1");
    });

    it("deduplicates intake across retries without clearing completed work", async () => {
      const data = { emailAccountId, messageId: "message" };
      await prisma.fastmailSyncItem.create({
        data: { ...data, processedAt: new Date() },
      });
      await prisma.$transaction([
        prisma.fastmailSyncItem.createMany({
          data: [data],
          skipDuplicates: true,
        }),
        prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { lastSyncedHistoryId: "s2" },
        }),
      ]);
      const items = await prisma.fastmailSyncItem.findMany({
        where: { emailAccountId },
      });
      expect(items).toHaveLength(1);
      expect(items[0].processedAt).not.toBeNull();
    });

    it("allows only one draft replacement to win a version race", async () => {
      await prisma.fastmailDraft.create({
        data: { emailAccountId, id: "stable", messageId: "original" },
      });
      const results = await Promise.all(
        ["replacement-1", "replacement-2"].map((messageId) =>
          prisma.fastmailDraft.updateMany({
            where: { emailAccountId, id: "stable", version: 0 },
            data: { messageId, version: { increment: 1 } },
          }),
        ),
      );
      expect(results.map((result) => result.count).sort()).toEqual([0, 1]);
    });

    it("encrypts calendar app passwords at rest and decrypts through the canonical client", async () => {
      const connection = await prisma.calendarConnection.create({
        data: {
          emailAccountId,
          provider: "fastmail",
          email,
          appPassword: "calendar-test-only",
        },
      });
      expect(connection.appPassword).toBe("calendar-test-only");
      const rows = await prisma.$queryRaw<
        Array<{ appPassword: string }>
      >`SELECT "appPassword" FROM "CalendarConnection" WHERE id = ${connection.id}`;
      expect(rows[0].appPassword).not.toBe("calendar-test-only");
      expect(rows[0].appPassword).not.toContain("calendar-test-only");
    });
  },
);
