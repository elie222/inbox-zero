import { bootstrapLocalMailStorageLedgerBatch } from "@/utils/email-cache/local-mail-storage-ledger-bootstrap";
import { createSearchIndexClient } from "@/utils/email-cache/search-index-client";
import { getEmailCacheDatabase } from "@/utils/email-cache/database";
import {
  activateMailSync,
  clearMailActivation,
} from "@/utils/email-cache/mail-activation";

const scope = { emailAccountId: "account", generation: "first" };
const client = createSearchIndexClient();
Object.assign(window, {
  indexClientTest: {
    client,
    async storageLedger() {
      return (
        await (await requireDatabase()).get("localMailStorageLedger", "origin")
      )?.index;
    },
    async activate() {
      activateMailSync(scope.emailAccountId);
      await (await requireDatabase()).put("searchIndexAccounts", scope);
      while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
    },
    async blockStorage() {
      const database = await requireDatabase();
      const ledger = (await database.get("localMailStorageLedger", "origin"))!;
      ledger.stores.threadRows.bytes = 1024 ** 3;
      await database.put("localMailStorageLedger", ledger);
    },
    async restoreStorage() {
      const database = await requireDatabase();
      await database.delete("localMailStorageLedger", "origin");
      while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
    },
    async removeSource() {
      clearMailActivation(scope.emailAccountId);
      await (await requireDatabase()).delete(
        "searchIndexAccounts",
        scope.emailAccountId,
      );
    },
    state() {
      return client.request(scope, {
        command: "state",
        emailAccountId: scope.emailAccountId,
      });
    },
    reset() {
      return client.request(scope, {
        command: "reset",
        request: { ...scope, expectedGeneration: null },
      });
    },
    apply() {
      return client.request(scope, {
        command: "apply",
        request: {
          ...scope,
          expectedRevision: 0,
          revision: 1,
          upserts: [
            {
              id: "message",
              threadId: "thread",
              subject: "Sample",
              snippet: "",
              headers: { from: "", to: "", subject: "Sample", date: "" },
              labelIds: [],
              internalDate: "1700000000000",
              textPlain: "searchable body",
            },
          ],
          deletes: [],
        },
      });
    },
    search() {
      return client.request(scope, {
        command: "search",
        request: { ...scope, query: "searchable", labels: [] },
      });
    },
    cleanup() {
      return client.cleanupAccount(scope);
    },
  },
});

async function requireDatabase() {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Local source database unavailable");
  return database;
}
