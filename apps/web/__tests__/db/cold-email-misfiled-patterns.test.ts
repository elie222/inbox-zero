import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { hasIncludePatternOnAnotherRule } from "@/utils/rule/learned-patterns";

const state = vi.hoisted(() => ({ prisma: null as PrismaClient | null }));
vi.mock("@/utils/prisma", () => ({
  default: {
    get groupItem() {
      return state.prisma!.groupItem;
    },
  },
}));

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "misfiled cold email patterns",
  () => {
    let client: Client;
    let schema: string;

    beforeEach(async () => {
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      schema = `cold_email_patterns_${randomUUID().replaceAll("-", "")}`;
      await client.query(
        `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`,
      );
      await client.query(`
      CREATE TYPE "GroupItemType" AS ENUM ('FROM', 'SUBJECT');
      CREATE TYPE "GroupItemSource" AS ENUM ('USER', 'AI', 'LABEL_ADDED', 'LABEL_REMOVED');
      CREATE TYPE "SystemType" AS ENUM ('COLD_EMAIL', 'NEWSLETTER');
      CREATE TABLE "EmailAccount" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL);
      CREATE TABLE "Group" (
        "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "emailAccountId" TEXT NOT NULL
      );
      CREATE TABLE "Rule" (
        "id" TEXT PRIMARY KEY, "groupId" TEXT UNIQUE,
        "systemType" "SystemType", "enabled" BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE "GroupItem" (
        "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "groupId" TEXT,
        "type" "GroupItemType" NOT NULL, "value" TEXT NOT NULL,
        "exclude" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT,
        "threadId" TEXT, "messageId" TEXT, "source" "GroupItemSource",
        UNIQUE ("groupId", "type", "value")
      );
      INSERT INTO "EmailAccount" ("id", "email") VALUES ('account', 'me@acme.com');
      INSERT INTO "Group" ("id", "name", "emailAccountId") VALUES
        ('cold-group', 'Cold Email', 'account'),
        ('newsletter-group', 'Newsletter', 'account'),
        ('disabled-group', 'Disabled', 'account');
      INSERT INTO "Rule" ("id", "groupId", "systemType", "enabled") VALUES
        ('cold-rule', 'cold-group', 'COLD_EMAIL', true),
        ('newsletter-rule', 'newsletter-group', 'NEWSLETTER', true),
        ('disabled-rule', 'disabled-group', NULL, false);
    `);
      state.prisma = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: process.env.DATABASE_URL },
          { schema },
        ),
      });
    });

    afterEach(async () => {
      await state.prisma?.$disconnect();
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    });

    describe("hasIncludePatternOnAnotherRule", () => {
      it("finds an inclusion on another enabled rule, ignoring the rule itself", async () => {
        await insertPatterns(`
        ('newsletter', 'newsletter-group', 'sender@example.com', false, 'AI'),
        ('own', 'cold-group', 'other@example.com', false, 'AI')
      `);

        expect(await claimed("Sender@Example.com")).toBe(true);
        expect(await claimed("other@example.com")).toBe(false);
      });

      it("matches the way rules do, including domain patterns and full From headers", async () => {
        await insertPatterns(`
        ('domain', 'newsletter-group', '@news.example.org', false, 'USER')
      `);

        expect(await claimed("Weekly <digest@news.example.org>")).toBe(true);
        expect(await claimed("someone@example.org")).toBe(false);
      });

      it("ignores exclusions and disabled rules", async () => {
        await insertPatterns(`
        ('excluded', 'newsletter-group', 'excluded@example.com', true, 'USER'),
        ('disabled', 'disabled-group', 'disabled@example.com', false, 'USER')
      `);

        expect(await claimed("excluded@example.com")).toBe(false);
        expect(await claimed("disabled@example.com")).toBe(false);
      });

      function claimed(from: string) {
        return hasIncludePatternOnAnotherRule({
          emailAccountId: "account",
          from,
          ruleId: "cold-rule",
        });
      }
    });

    it("migration removes claimed senders and colleagues, keeping everything else", async () => {
      await insertPatterns(`
      ('claimed', 'cold-group', 'sender@example.com', false, 'AI'),
      ('claimed-header-form', 'cold-group', 'news two <sender2@example.com>', false, 'AI'),
      ('colleague', 'cold-group', 'colleague@acme.com', false, 'AI'),
      ('claimed-by-disabled', 'cold-group', 'disabled@example.com', false, 'AI'),
      ('user-authored', 'cold-group', 'sender@example.com2', false, 'USER'),
      ('excluded', 'cold-group', 'excluded@example.com', true, 'AI'),
      ('real-cold', 'cold-group', 'stranger@example.com', false, 'AI'),
      ('claimed-by-domain', 'cold-group', 'digest@news.example.org', false, 'AI'),
      ('claim-1', 'newsletter-group', 'sender@example.com', false, 'AI'),
      ('claim-2', 'newsletter-group', 'sender2@example.com', false, 'USER'),
      ('claim-3', 'newsletter-group', 'sender@example.com2', false, 'USER'),
      ('claim-4', 'newsletter-group', 'excluded@example.com', false, 'USER'),
      ('claim-domain', 'newsletter-group', '@news.example.org', false, 'USER'),
      ('claim-disabled', 'disabled-group', 'disabled@example.com', false, 'USER')
    `);

      await client.query(
        await readFile(
          new URL(
            "../../prisma/migrations/20260924120000_remove_misfiled_cold_email_patterns/migration.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );

      expect(await remainingColdIds()).toEqual([
        "claimed-by-disabled",
        "excluded",
        "real-cold",
        "user-authored",
      ]);
    });

    it("migration keeps same-domain senders on public email providers", async () => {
      await client.query(
        `UPDATE "EmailAccount" SET "email" = 'me@gmail.com' WHERE "id" = 'account'`,
      );
      await insertPatterns(
        `('freemail-colleague', 'cold-group', 'stranger@gmail.com', false, 'AI')`,
      );

      await client.query(
        await readFile(
          new URL(
            "../../prisma/migrations/20260924120000_remove_misfiled_cold_email_patterns/migration.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );

      expect(await remainingColdIds()).toEqual(["freemail-colleague"]);
    });

    function insertPatterns(values: string) {
      return client.query(`
      INSERT INTO "GroupItem" ("id", "groupId", "value", "exclude", "source", "type")
      SELECT v.id, v."groupId", v.value, v.exclude, v.source::"GroupItemSource", 'FROM'
      FROM (VALUES ${values}) AS v(id, "groupId", value, exclude, source)
    `);
    }

    async function remainingColdIds() {
      const { rows } = await client.query<{ id: string }>(
        `SELECT "id" FROM "GroupItem" WHERE "groupId" = 'cold-group' ORDER BY "id"`,
      );
      return rows.map((row) => row.id);
    }
  },
);
