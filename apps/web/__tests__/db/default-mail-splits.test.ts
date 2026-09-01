import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  ActionType,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { seedDefaultMailSplits } from "@/utils/mail/default-splits.server";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

describe.skipIf(!RUN_DB_TESTS)(
  "default mail splits (real database)",
  { timeout: 30_000 },
  () => {
    let emailAccountId: string;

    const accountEmail = "default-mail-splits-test@example.com";

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });

      const user = await prisma.user.create({ data: { email: accountEmail } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: accountEmail,
          type: "oauth",
        },
      });
      const emailAccount = await prisma.emailAccount.create({
        data: { email: accountEmail, userId: user.id, accountId: account.id },
      });
      emailAccountId = emailAccount.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
    });

    test("preserves a saved split created while default initialization waits", async () => {
      const lockClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await lockClient.connect();
      await lockClient.query("BEGIN");

      try {
        await lockClient.query(
          "SELECT pg_advisory_xact_lock(742931, hashtext($1))",
          [emailAccountId],
        );
        await lockClient.query(
          `INSERT INTO "MailSplit" (
            "id", "createdAt", "updatedAt", "name", "kind", "order", "emailAccountId"
          ) VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3, 0, $4)`,
          [
            "concurrent-saved-split",
            "Saved",
            MailSplitKind.UNREAD,
            emailAccountId,
          ],
        );

        const seeding = seedDefaultMailSplits({
          emailAccountId,
          rules: [
            {
              systemType: SystemType.RECEIPT,
              actions: [{ type: ActionType.LABEL, labelId: "receipt-label" }],
            },
          ],
        });

        await waitForSeederLock(lockClient);
        await lockClient.query("COMMIT");
        await seeding;
      } catch (error) {
        await lockClient.query("ROLLBACK");
        throw error;
      } finally {
        await lockClient.end();
      }

      const splits = await prisma.mailSplit.findMany({
        where: { emailAccountId },
      });

      expect(splits).toHaveLength(1);
      expect(splits[0]?.id).toBe("concurrent-saved-split");
    });
  },
);

async function waitForSeederLock(client: Client) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await client.query<{ waiting: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
          AND query LIKE '%pg_advisory_xact_lock(742931%'
      ) AS waiting
    `);
    if (result.rows[0]?.waiting) return;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Default split seeder did not wait for the account lock");
}
