import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20260728170000_normalize_group_item_values/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "group item normalization migration",
  () => {
    test("preserves letters, trims whitespace, and deduplicates before normalization", async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        await client.query(`BEGIN;
        CREATE SCHEMA normalize_group_item_migration_test;
        SET LOCAL search_path = normalize_group_item_migration_test;
        CREATE TYPE "GroupItemSource" AS ENUM ('AI', 'USER');
        CREATE TYPE "GroupItemType" AS ENUM ('FROM', 'SUBJECT');
        CREATE TABLE "GroupItem" (
          "id" text PRIMARY KEY,
          "groupId" text,
          "type" "GroupItemType" NOT NULL DEFAULT 'FROM',
          "value" text NOT NULL,
          "source" "GroupItemSource",
          "exclude" boolean NOT NULL DEFAULT false,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now(),
          UNIQUE ("groupId", "type", "value")
        );
        INSERT INTO "GroupItem" ("id", "groupId", "value", "source") VALUES
          ('uppercase', 'sender', 'Vendor@example.com', 'USER'),
          ('lowercase', 'sender', 'vendor@example.com', 'AI'),
          ('letter', 'letter', 'v', NULL);
      `);
        await client.query(
          `INSERT INTO "GroupItem" ("id", "groupId", "value", "type", "exclude") VALUES
          ('whitespace', 'whitespace', $1, 'FROM', false),
          ('subject', 'subject', $2, 'SUBJECT', false),
          ('exclusion', 'exclusion', ' BLOCK@example.com ', 'FROM', true)`,
          [" \t\n\r\f\v\u00a0\u2003\ufeff", "\v Invoice \v"],
        );
        await client.query(migration);
        const readItems = () =>
          client.query(
            `SELECT "id", "value", "source", "exclude" FROM "GroupItem" ORDER BY "id"`,
          );
        const result = await readItems();
        expect(result.rows).toEqual([
          {
            id: "exclusion",
            value: "block@example.com",
            source: "USER",
            exclude: true,
          },
          { id: "letter", value: "v", source: null, exclude: false },
          { id: "subject", value: "invoice", source: "USER", exclude: false },
          {
            id: "uppercase",
            value: "vendor@example.com",
            source: "USER",
            exclude: false,
          },
        ]);
        await client.query(migration);
        expect((await readItems()).rows).toEqual(result.rows);
      } finally {
        await client.query("ROLLBACK");
        await client.end();
      }
    });
  },
);
