import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  ActionType,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import {
  createMailSplit,
  removeLabelFromMailSplits,
} from "@/utils/mail/splits.server";
import {
  seedDefaultMailSplits,
  setDefaultMailSplits,
} from "@/utils/mail/default-splits.server";

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

    // The insert goes through raw SQL, so the array parameter needs a real
    // database to prove it lands as a Postgres text[] rather than a string.
    test("stores every label of a multi-label split", async () => {
      const result = await createMailSplit({
        emailAccountId,
        name: "Feedback",
        kind: MailSplitKind.LABEL,
        values: ["label-users", "label-customers"],
      });

      expect(result?.status).toBe("created");
      const saved = await prisma.mailSplit.findFirst({
        where: { emailAccountId, name: "Feedback" },
      });
      expect(saved?.values).toEqual(["label-users", "label-customers"]);
    });

    test("adds and removes rule-label defaults without touching a widened split", async () => {
      const defaultSplits = [
        {
          name: "Receipt",
          kind: MailSplitKind.LABEL,
          values: ["receipt-label"],
        },
      ];
      await setDefaultMailSplits({
        emailAccountId,
        defaultSplits,
        enabled: true,
      });
      const afterEnable = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        select: { name: true },
      });
      expect(afterEnable.map((split) => split.name)).toEqual(["Receipt"]);

      await createMailSplit({
        emailAccountId,
        name: "Receipts and invoices",
        kind: MailSplitKind.LABEL,
        values: ["receipt-label", "invoice-label"],
      });

      await setDefaultMailSplits({
        emailAccountId,
        defaultSplits,
        enabled: false,
      });

      const remaining = await prisma.mailSplit.findMany({
        where: { emailAccountId },
      });
      expect(remaining.map((split) => split.name)).toEqual([
        "Receipts and invoices",
      ]);
    });

    test("narrows splits that share a deleted label and drops the ones left empty", async () => {
      await createMailSplit({
        emailAccountId,
        name: "Feedback",
        kind: MailSplitKind.LABEL,
        values: ["gone"],
      });
      await createMailSplit({
        emailAccountId,
        name: "Feedback and support",
        kind: MailSplitKind.LABEL,
        values: ["gone", "kept"],
      });

      await removeLabelFromMailSplits({ emailAccountId, labelId: "gone" });

      const remaining = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        select: { name: true, values: true },
      });
      expect(remaining).toEqual([
        { name: "Feedback and support", values: ["kept"] },
      ]);
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
