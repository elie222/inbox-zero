import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("engine retainAccounts", () => {
  it("purges local accounts the user no longer has", async () => {
    const { engine, store } = await engineWithAccounts([
      "acc-1",
      "acc-deleted",
      "acc-2",
    ]);

    await engine.retainAccounts(["acc-1", "acc-2"]);

    const remaining = (await store.readAccountSyncStates()).map(
      (account) => account.accountId,
    );
    expect(remaining).toEqual(["acc-1", "acc-2"]);
    await engine.close();
  });

  it("keeps every account when given an empty list", async () => {
    const { engine, store } = await engineWithAccounts(["acc-1", "acc-2"]);

    await engine.retainAccounts([]);

    expect(await store.readAccountSyncStates()).toHaveLength(2);
    await engine.close();
  });
});

async function engineWithAccounts(accountIds: string[]) {
  const store = await createSqliteMailStore(createNodeSqliteDriver());
  for (const accountId of accountIds) {
    await store.ensureAccount({
      accountId,
      provider: "google",
      generation: "g1",
    });
  }
  const engine = createMailEngine({
    store,
    source: {} as MailboxSource,
    executor: {} as OperationExecutor,
    runtime: createHostRuntime(),
  });
  return { engine, store };
}
