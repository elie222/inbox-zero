import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { SqliteDriver } from "./driver";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("sqlite mail store getDiagnostics", () => {
  it("lists each command with its own messages and conversations", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "a",
      provider: "google",
      generation: "g",
    });
    await insertOperation(driver, {
      commandId: "archive-1",
      createdAtMs: 1,
      payload: { kind: "conversations", change: { kind: "archive" } },
      conversations: ["t-1", "t-2"],
      targets: [
        ["m-1", "t-1"],
        ["m-2", "t-1"],
        ["m-3", "t-2"],
      ],
    });
    await insertOperation(driver, {
      commandId: "send-1",
      createdAtMs: 2,
      payload: {
        kind: "send",
        replyToConversationId: "t-3",
        replyToMessageId: "m-4",
      },
      conversations: [],
      targets: [["m-4", "t-3"]],
    });

    const { commands } = await store.getDiagnostics("a");

    expect(commands).toEqual([
      {
        operationId: "archive-1",
        status: "succeeded",
        kind: "conversations",
        changeKind: "archive",
        change: { kind: "archive" },
        messageIds: ["m-1", "m-2", "m-3"],
        conversationIds: ["t-1", "t-2"],
      },
      {
        operationId: "send-1",
        status: "succeeded",
        kind: "send",
        changeKind: null,
        change: null,
        messageIds: ["m-4"],
        conversationIds: ["t-3"],
      },
    ]);
  });

  // Completed commands stay on disk, and every queued mail action reads
  // diagnostics first, so its cost must grow linearly with that history.
  it("stays fast for an account with a long command history", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "a",
      provider: "google",
      generation: "g",
    });
    for (let i = 0; i < 3000; i++) {
      await insertOperation(driver, {
        commandId: `c-${i}`,
        createdAtMs: i,
        payload: { kind: "conversations", change: { kind: "archive" } },
        conversations: [`t-${i}`],
        targets: [0, 1, 2].map((j) => [`m-${i}-${j}`, `t-${i}`] as const),
      });
    }

    const start = performance.now();
    const diagnostics = await store.getDiagnostics("a");
    const elapsedMs = performance.now() - start;

    expect(diagnostics.commands).toHaveLength(3000);
    // Wall-clock measurements include contention on shared development hosts.
    expect(elapsedMs).toBeLessThan(1000);
  }, 120_000);
});

async function insertOperation(
  driver: SqliteDriver,
  input: {
    commandId: string;
    createdAtMs: number;
    payload: Record<string, unknown>;
    conversations: string[];
    targets: ReadonlyArray<readonly [string, string]>;
  },
) {
  await driver.write(async (tx) => {
    await tx.execute(
      `INSERT INTO operations(account_id, command_id, status, authority, intent_hash, payload_json, created_at_ms)
       VALUES ('a', ?, 'succeeded', 'backend', 'hash', ?, ?)`,
      [input.commandId, JSON.stringify(input.payload), input.createdAtMs],
    );
    for (const conversationId of input.conversations) {
      await tx.execute(
        `INSERT INTO operation_conversations(account_id, command_id, conversation_id, resolution_id, complete)
         VALUES ('a', ?, ?, 'resolution', 1)`,
        [input.commandId, conversationId],
      );
    }
    for (const [messageId, conversationId] of input.targets) {
      await tx.execute(
        `INSERT INTO operation_targets(account_id, command_id, message_id, conversation_id)
         VALUES ('a', ?, ?, ?)`,
        [input.commandId, messageId, conversationId],
      );
    }
  });
}
