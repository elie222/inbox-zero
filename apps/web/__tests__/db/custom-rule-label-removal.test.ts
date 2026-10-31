import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { removeAiLearnedPattern } from "@/utils/rule/learned-patterns";

const state = vi.hoisted(() => ({ prisma: null as PrismaClient | null }));
vi.mock("@/utils/prisma", () => ({
  default: {
    get groupItem() {
      return state.prisma!.groupItem;
    },
  },
}));

describe.skipIf(!process.env.RUN_DB_TESTS)("custom rule label removal", () => {
  let client: Client;
  let schema: string;

  beforeEach(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    schema = `custom_rule_removal_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`,
    );
    await client.query(`
        CREATE TYPE "GroupItemType" AS ENUM ('FROM', 'SUBJECT');
        CREATE TYPE "GroupItemSource" AS ENUM ('USER', 'AI', 'LABEL_ADDED', 'LABEL_REMOVED');
        CREATE TYPE "SystemType" AS ENUM ('NEWSLETTER');
        CREATE TYPE "ClassificationFeedbackEventType" AS ENUM ('LABEL_ADDED', 'LABEL_REMOVED');
        CREATE TABLE "Group" (
          "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" TEXT NOT NULL,
          "prompt" TEXT, "emailAccountId" TEXT NOT NULL
        );
        CREATE TABLE "Rule" (
          "id" TEXT PRIMARY KEY, "groupId" TEXT UNIQUE, "systemType" "SystemType"
        );
        CREATE TABLE "GroupItem" (
          "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL, "groupId" TEXT,
          "type" "GroupItemType" NOT NULL, "value" TEXT NOT NULL,
          "exclude" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT,
          "threadId" TEXT, "messageId" TEXT, "source" "GroupItemSource",
          UNIQUE ("groupId", "type", "value")
        );
        CREATE TABLE "ClassificationFeedback" (
          "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL,
          "sender" TEXT NOT NULL, "eventType" "ClassificationFeedbackEventType" NOT NULL,
          "ruleId" TEXT NOT NULL, "emailAccountId" TEXT NOT NULL
        );
        INSERT INTO "Group" ("id", "name", "emailAccountId") VALUES
          ('custom-group', 'Custom', 'account'),
          ('system-group', 'Newsletter', 'account');
        INSERT INTO "Rule" ("id", "groupId", "systemType") VALUES
          ('custom-rule', 'custom-group', NULL),
          ('system-rule', 'system-group', 'NEWSLETTER');
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

  it("removes only the AI-inferred inclusion for the sender on that rule", async () => {
    await client.query(`
        INSERT INTO "GroupItem" ("id", "updatedAt", "groupId", "type", "value", "exclude", "source") VALUES
          ('ai', now(), 'custom-group', 'FROM', 'sender@example.com', false, 'AI'),
          ('other-sender', now(), 'custom-group', 'FROM', 'other@example.com', false, 'AI'),
          ('other-rule', now(), 'system-group', 'FROM', 'sender@example.com', false, 'AI')
      `);

    const removed = await removeAiLearnedPattern({
      emailAccountId: "account",
      from: "Sender@Example.com",
      ruleId: "custom-rule",
    });

    expect(removed).toBe(1);
    expect(await remainingIds()).toEqual(["other-rule", "other-sender"]);
  });

  it("keeps user-authored patterns and exclusions", async () => {
    await client.query(`
      INSERT INTO "GroupItem" ("id", "updatedAt", "groupId", "type", "value", "exclude", "source") VALUES
        ('user', now(), 'custom-group', 'FROM', 'sender@example.com', false, 'USER'),
        ('ai-exclude', now(), 'custom-group', 'FROM', 'excluded@example.com', true, 'AI')
    `);

    for (const from of ["sender@example.com", "excluded@example.com"]) {
      expect(
        await removeAiLearnedPattern({
          emailAccountId: "account",
          from,
          ruleId: "custom-rule",
        }),
      ).toBe(0);
    }

    expect(await remainingIds()).toEqual(["ai-exclude", "user"]);
  });

  it("migration drops custom-rule AI patterns contradicted by a later label removal", async () => {
    await client.query(`
        INSERT INTO "GroupItem" ("id", "updatedAt", "groupId", "type", "value", "exclude", "source") VALUES
          ('contradicted', '2026-01-01', 'custom-group', 'FROM', 'removed@example.com', false, 'AI'),
          ('header-form', '2026-01-01', 'custom-group', 'FROM', 'removed two <removed2@example.com>', false, 'AI'),
          ('relearned', '2026-06-01', 'custom-group', 'FROM', 'relearned@example.com', false, 'AI'),
          ('user', '2026-01-01', 'custom-group', 'FROM', 'user@example.com', false, 'USER'),
          ('system', '2026-01-01', 'system-group', 'FROM', 'removed@example.com', false, 'AI'),
          ('untouched', '2026-01-01', 'custom-group', 'FROM', 'kept@example.com', false, 'AI')
      `);
    await client.query(`
        INSERT INTO "ClassificationFeedback" ("id", "createdAt", "sender", "eventType", "ruleId", "emailAccountId") VALUES
          ('f1', '2026-02-01', 'removed@example.com', 'LABEL_REMOVED', 'custom-rule', 'account'),
          ('f2', '2026-02-01', 'removed2@example.com', 'LABEL_REMOVED', 'custom-rule', 'account'),
          ('f3', '2026-02-01', 'relearned@example.com', 'LABEL_REMOVED', 'custom-rule', 'account'),
          ('f4', '2026-02-01', 'user@example.com', 'LABEL_REMOVED', 'custom-rule', 'account'),
          ('f5', '2026-02-01', 'removed@example.com', 'LABEL_REMOVED', 'system-rule', 'account'),
          ('f6', '2026-02-01', 'kept@example.com', 'LABEL_ADDED', 'custom-rule', 'account')
      `);

    await client.query(
      await readFile(
        new URL(
          "../../prisma/migrations/20260919210000_remove_contradicted_ai_patterns_on_custom_rules/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    expect(await remainingIds()).toEqual([
      "relearned",
      "system",
      "untouched",
      "user",
    ]);
  });

  async function remainingIds() {
    const { rows } = await client.query<{ id: string }>(
      `SELECT "id" FROM "GroupItem" ORDER BY "id"`,
    );
    return rows.map((row) => row.id);
  }
});
