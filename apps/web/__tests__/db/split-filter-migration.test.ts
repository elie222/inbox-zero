import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20260910000000_split_inbox_filters/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe.skipIf(!process.env.RUN_DB_TESTS)("split filter migration", () => {
  test("preserves inbox, unread, category and label-union semantics", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`BEGIN;
        CREATE SCHEMA split_filter_migration_test;
        SET LOCAL search_path = split_filter_migration_test;
        CREATE TYPE "MailSplitKind" AS ENUM ('INBOX', 'UNREAD', 'LABEL', 'CATEGORY');
        CREATE TABLE "MailSplit" ("id" text PRIMARY KEY, "kind" "MailSplitKind", "values" text[]);
        INSERT INTO "MailSplit" VALUES ('all', 'INBOX', '{}'), ('unread', 'UNREAD', '{}'), ('labels', 'LABEL', '{one,two}'), ('category', 'CATEGORY', '{CATEGORY_PROMOTIONS}');
      `);
      await client.query(migration);
      const result = await client.query(
        `SELECT s."id", s."matchAll", COALESCE(json_agg(json_build_object('kind', f."kind", 'value', f."value") ORDER BY f."order") FILTER (WHERE f."id" IS NOT NULL), '[]') AS filters FROM "MailSplit" s LEFT JOIN "MailSplitFilter" f ON f."mailSplitId" = s."id" GROUP BY s."id" ORDER BY s."id"`,
      );
      expect(result.rows).toEqual([
        { id: "all", matchAll: true, filters: [] },
        {
          id: "category",
          matchAll: true,
          filters: [{ kind: "CATEGORY", value: "CATEGORY_PROMOTIONS" }],
        },
        {
          id: "labels",
          matchAll: false,
          filters: [
            { kind: "LABEL", value: "one" },
            { kind: "LABEL", value: "two" },
          ],
        },
        {
          id: "unread",
          matchAll: true,
          filters: [{ kind: "UNREAD", value: null }],
        },
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
