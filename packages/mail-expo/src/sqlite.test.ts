import { describe, expect, it } from "vitest";
import { createSerializedDriver } from "./sqlite";

describe("serialized expo driver", () => {
  it("rolls back a failed write and finalizes statements", async () => {
    const database = fakeDatabase();
    const driver = createSerializedDriver(database);
    await driver.write(async (tx) => {
      await tx.execute("INSERT INTO items(name) VALUES (?)", ["alpha"]);
    });
    await expect(
      driver.write(async (tx) => {
        await tx.execute("INSERT INTO items(name) VALUES (?)", ["beta"]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await driver.read((tx) => tx.query("SELECT name FROM items"));
    expect(rows).toEqual([{ name: "alpha" }]);
    expect(database.finalized).toBeGreaterThan(0);
    expect(database.openStatements).toBe(0);
    await driver.close();
    await expect(driver.read((tx) => tx.query("SELECT 1"))).rejects.toThrow(
      "closed",
    );
  });
});

function fakeDatabase() {
  let rows: string[] = [];
  let snapshot = rows;
  const state = {
    finalized: 0,
    openStatements: 0,
    closed: false,
  };
  const database = {
    get finalized() {
      return state.finalized;
    },
    get openStatements() {
      return state.openStatements;
    },
    async execAsync() {
      return;
    },
    async prepareAsync(sql: string) {
      state.openStatements += 1;
      let finalized = false;
      return {
        async executeAsync(params: readonly (string | null)[] = []) {
          if (finalized) throw new Error("finalized");
          if (sql.startsWith("INSERT")) {
            rows = [...rows, String(params[0])];
            return { changes: 1, getAllAsync: async () => [] };
          }
          return {
            changes: 0,
            getAllAsync: async () => snapshot.map((name) => ({ name })),
          };
        },
        async finalizeAsync() {
          finalized = true;
          state.openStatements -= 1;
          state.finalized += 1;
        },
      };
    },
    async withExclusiveTransactionAsync(
      task: (txn: typeof database) => Promise<void>,
    ) {
      const before = rows;
      try {
        await task(database);
        snapshot = rows;
      } catch (error) {
        rows = before;
        snapshot = rows;
        throw error;
      }
    },
    async withTransactionAsync() {
      throw new Error("exclusive transaction should be used");
    },
    async closeAsync() {
      state.closed = true;
    },
  };
  return database;
}
