import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import { addGroupItem, saveGroupItem } from "@/utils/group/group-item";

const state = vi.hoisted(() => ({ prisma: null as PrismaClient | null }));
vi.mock("@/utils/prisma", () => ({
  default: {
    get groupItem() {
      return state.prisma!.groupItem;
    },
  },
}));

describe.skipIf(!process.env.RUN_DB_TESTS)("group item reconciliation", () => {
  let client: Client;
  let schema: string;

  beforeEach(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    schema = `group_items_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`,
    );
    await client.query(`
      CREATE TYPE "GroupItemType" AS ENUM ('FROM', 'SUBJECT');
      CREATE TYPE "GroupItemSource" AS ENUM ('USER', 'AI', 'LABEL_ADDED', 'LABEL_REMOVED');
      CREATE TABLE "GroupItem" (
        "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL, "groupId" TEXT,
        "type" "GroupItemType" NOT NULL, "value" TEXT NOT NULL,
        "exclude" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT,
        "threadId" TEXT, "messageId" TEXT, "source" "GroupItemSource",
        UNIQUE ("groupId", "type", "value")
      )
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

  const pattern = {
    groupId: "group",
    type: GroupItemType.FROM,
    value: "sender@example.com",
  };

  it("keeps user ownership through concurrent automatic saves and permits explicit edits", async () => {
    await Promise.all([
      addGroupItem({
        ...pattern,
        value: " Sender@Example.COM\n",
        exclude: true,
      }),
      ...Array.from({ length: 8 }, () =>
        saveGroupItem({
          ...pattern,
          exclude: false,
          source: GroupItemSource.AI,
        }),
      ),
    ]);
    expect(await state.prisma!.groupItem.findMany()).toEqual([
      expect.objectContaining({
        ...pattern,
        exclude: true,
        source: GroupItemSource.USER,
      }),
    ]);
    await addGroupItem({ ...pattern, exclude: false });
    expect(await state.prisma!.groupItem.findFirst()).toMatchObject({
      exclude: false,
      source: GroupItemSource.USER,
    });
  });

  it("retains exclusions and provenance for inferred saves", async () => {
    await saveGroupItem({
      ...pattern,
      exclude: true,
      source: GroupItemSource.LABEL_REMOVED,
    });
    await saveGroupItem({ ...pattern, source: GroupItemSource.AI });
    expect(await state.prisma!.groupItem.findFirst()).toMatchObject({
      exclude: true,
      source: GroupItemSource.LABEL_REMOVED,
    });
    await saveGroupItem({
      ...pattern,
      exclude: false,
      source: GroupItemSource.LABEL_ADDED,
    });
    expect(await state.prisma!.groupItem.findFirst()).toMatchObject({
      exclude: false,
      source: GroupItemSource.LABEL_REMOVED,
    });
  });

  it("protects legacy ownership without inventing provenance", async () => {
    await state.prisma!.groupItem.create({
      data: { ...pattern, exclude: true },
    });
    await saveGroupItem({
      ...pattern,
      exclude: false,
      source: GroupItemSource.AI,
    });
    expect(await state.prisma!.groupItem.findFirst()).toMatchObject({
      exclude: true,
      source: null,
    });
  });

  it("normalizes and deduplicates legacy rows while preserving authored evidence", async () => {
    await client.query(`
      INSERT INTO "GroupItem" ("id", "updatedAt", "groupId", "type", "value", "exclude", "source")
      VALUES
        ('legacy', '2025-01-01', 'group', 'FROM', E' Sender@Example.COM\\n', true, NULL),
        ('automatic', '2026-07-01', 'group', 'FROM', 'sender@example.com', false, 'AI'),
        ('blank', '2025-01-01', 'group', 'SUBJECT', E' \\t\\n', false, NULL),
        ('subject', '2025-01-01', 'group', 'SUBJECT', ' Invoice ', false, NULL),
        ('ambiguous', '2025-01-01', 'group', 'FROM', 'older@example.com', false, NULL),
        ('recent', '2026-07-01', 'group', 'FROM', 'recent@example.com', false, NULL)
    `);
    const migration = await readFile(
      new URL(
        "../../prisma/migrations/20260728170000_normalize_group_item_values/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(migration);
    const rows = await state.prisma!.groupItem.findMany({
      orderBy: { id: "asc" },
    });
    expect(rows).toEqual([
      expect.objectContaining({ id: "ambiguous", source: null }),
      expect.objectContaining({
        id: "legacy",
        value: "sender@example.com",
        exclude: true,
        source: GroupItemSource.USER,
      }),
      expect.objectContaining({ id: "recent", source: null }),
      expect.objectContaining({
        id: "subject",
        value: "invoice",
        source: GroupItemSource.USER,
      }),
    ]);
  });
});
