import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20260908180000_unify_mail_splits/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe.skipIf(!process.env.RUN_DB_TESTS)("mail split migration", () => {
  test("materializes visible defaults and preserves hidden splits and name collisions", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`
        BEGIN;
        CREATE TEMP TABLE "EmailAccount" ("id" text PRIMARY KEY, "mailHiddenBuiltInSplits" text[] NOT NULL DEFAULT '{}');
        CREATE TEMP TABLE "MailSplit" (
          "id" text PRIMARY KEY, "createdAt" timestamp, "updatedAt" timestamp,
          "name" text NOT NULL, "kind" "MailSplitKind" NOT NULL,
          "values" text[] NOT NULL DEFAULT '{}', "order" integer NOT NULL, "emailAccountId" text NOT NULL,
          UNIQUE ("emailAccountId", "name")
        );
        CREATE UNIQUE INDEX "MailSplit_emailAccountId_order_key" ON "MailSplit" ("emailAccountId", "order");
        INSERT INTO "EmailAccount" VALUES ('new', '{}'), ('hidden', '{all,unread}'), ('custom', '{unread}'), ('capped', '{}');
        INSERT INTO "MailSplit" VALUES ('label', NOW(), NOW(), 'All', 'LABEL', '{label-1}', 0, 'custom');
        INSERT INTO "MailSplit"
        SELECT 'label-' || n, NOW(), NOW(), 'Custom ' || n, 'LABEL', '{label-1}', n - 1, 'capped'
        FROM generate_series(1, 12) n;
      `);
      await client.query(migration);
      const result = await client.query(
        'SELECT "emailAccountId", "name", "kind", "order" FROM "MailSplit" ORDER BY "emailAccountId", "order"',
      );
      expect(
        result.rows.filter((row) => row.emailAccountId === "capped"),
      ).toHaveLength(14);
      expect(
        result.rows.filter((row) => row.emailAccountId !== "capped"),
      ).toEqual([
        { emailAccountId: "custom", name: "All (2)", kind: "INBOX", order: 0 },
        { emailAccountId: "custom", name: "All", kind: "LABEL", order: 2 },
        { emailAccountId: "new", name: "All", kind: "INBOX", order: 0 },
        { emailAccountId: "new", name: "Unread", kind: "UNREAD", order: 1 },
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
