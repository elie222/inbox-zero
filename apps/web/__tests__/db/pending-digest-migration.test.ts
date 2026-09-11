import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolate the pre-migration schema so this test never removes the live index.
describe.skipIf(!process.env.RUN_DB_TESTS)("pending digest migration", () => {
  let client: Client;
  let schema: string;
  let migration: string;

  beforeEach(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    schema = `digest_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`,
    );
    await client.query(`
      CREATE TABLE "Digest" (
        "id" TEXT PRIMARY KEY, "emailAccountId" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL, "status" TEXT NOT NULL
      );
      CREATE TABLE "DigestItem" (
        "id" TEXT PRIMARY KEY, "digestId" TEXT NOT NULL REFERENCES "Digest"("id") ON DELETE CASCADE,
        "threadId" TEXT NOT NULL, "messageId" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL, "content" TEXT NOT NULL, "actionId" TEXT,
        UNIQUE ("digestId", "threadId", "messageId")
      );
      INSERT INTO "Digest" VALUES
        ('keeper', 'account', '2026-01-01', 'PENDING'),
        ('duplicate-1', 'account', '2026-01-02', 'PENDING'),
        ('duplicate-2', 'account', '2026-01-02', 'PENDING'),
        ('sent', 'account', '2026-01-01', 'SENT'),
        ('other', 'other-account', '2026-01-01', 'PENDING');
      INSERT INTO "DigestItem" VALUES
        ('original', 'keeper', 'thread', 'message', '2026-01-01', 'original summary', 'original-action'),
        ('repeated', 'duplicate-1', 'thread', 'message', '2026-01-02', 'other summary', 'other-action'),
        ('movable-a', 'duplicate-1', 'thread-2', 'message-2', '2026-01-02', 'kept summary', 'kept-action'),
        ('movable-b', 'duplicate-2', 'thread-2', 'message-2', '2026-01-02', 'discarded summary', 'discarded-action'),
        ('distinct', 'duplicate-2', 'thread-3', 'message-3', '2026-01-02', 'distinct summary', NULL),
        ('sent-item', 'sent', 'thread', 'message', '2026-01-01', 'sent summary', NULL);
    `);
    migration = await readFile(
      new URL(
        "../../prisma/migrations/20260505093300_unique_pending_digest_per_account/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });

  it("preserves distinct items and deterministically deduplicates content and action metadata", async () => {
    await client.query(migration);
    const digests = await client.query(
      'SELECT "id" FROM "Digest" ORDER BY "id"',
    );
    expect(digests.rows).toEqual([
      { id: "keeper" },
      { id: "other" },
      { id: "sent" },
    ]);
    const items = await client.query(
      'SELECT "id", "digestId", "content", "actionId" FROM "DigestItem" ORDER BY "id"',
    );
    expect(items.rows).toEqual([
      {
        id: "distinct",
        digestId: "keeper",
        content: "distinct summary",
        actionId: null,
      },
      {
        id: "movable-a",
        digestId: "keeper",
        content: "kept summary",
        actionId: "kept-action",
      },
      {
        id: "original",
        digestId: "keeper",
        content: "original summary",
        actionId: "original-action",
      },
      {
        id: "sent-item",
        digestId: "sent",
        content: "sent summary",
        actionId: null,
      },
    ]);
    await expect(
      client.query(
        `INSERT INTO "Digest" VALUES ('new', 'account', NOW(), 'PENDING')`,
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await client.query(
      `INSERT INTO "Digest" VALUES ('processing', 'account', NOW(), 'PROCESSING')`,
    );
  });

  it("rolls back all cleanup if index creation fails", async () => {
    await client.query(
      'CREATE INDEX "Digest_emailAccountId_pending_key" ON "Digest"("id")',
    );
    await expect(client.query(migration)).rejects.toMatchObject({
      code: "42P07",
    });
    await client.query("ROLLBACK");
    expect((await client.query('SELECT * FROM "Digest"')).rowCount).toBe(5);
    expect((await client.query('SELECT * FROM "DigestItem"')).rowCount).toBe(6);
    expect(
      (
        await client.query(
          `SELECT "digestId" FROM "DigestItem" WHERE "id" = 'movable-a'`,
        )
      ).rows,
    ).toEqual([{ digestId: "duplicate-1" }]);
  });
});
