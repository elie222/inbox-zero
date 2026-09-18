import { describe, expect, it } from "vitest";
import { createWasmSqliteDriver } from "./wasm-sqlite";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";

describe("browser wasm sqlite driver", () => {
  it("runs the shared store on an in-memory sqlite-wasm database", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const view = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 10,
      after: null,
    });
    expect(view.view.counts.matchingConversations).toBe(0);
    await store.close();
  });
});
