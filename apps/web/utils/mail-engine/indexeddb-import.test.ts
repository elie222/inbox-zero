import { describe, expect, it } from "vitest";
import { createNodeSqliteDriver } from "@inboxzero/mail-sqlite/node";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import {
  importLocalUserWork,
  mapMailMutationsForImport,
  mapReplyDraftsForImport,
} from "./indexeddb-import";
import type {
  StoredMailMutation,
  StoredReplyDraft,
} from "@/utils/email-cache/database";

describe("indexeddb user-work import", () => {
  it("imports drafts and pending archives idempotently", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const drafts = mapReplyDraftsForImport([
      {
        emailAccountId: "acc-1",
        threadId: "t1",
        messageId: "m1",
        revision: 1,
        updatedAt: Date.now(),
        content: {
          values: { to: "ada@example.com", subject: "Hi" },
          draft: {
            editableHtml: "<p>Hi</p>",
            quotedHtml: "",
            signatureHtml: "",
            mode: "rich",
            unsupported: [],
          },
          preservedBlocks: [],
          attachments: [],
        },
      } as StoredReplyDraft,
    ]);
    const mutations = mapMailMutationsForImport([
      {
        id: "mut-archive",
        batchId: "b1",
        emailAccountId: "acc-1",
        threadId: "t2",
        messageIds: ["m2"],
        kind: "archive",
        payload: {},
        status: "pending",
        attempts: 0,
      } as StoredMailMutation,
      {
        id: "mut-done",
        batchId: "b1",
        emailAccountId: "acc-1",
        threadId: "t3",
        messageIds: ["m3"],
        kind: "archive",
        payload: {},
        status: "succeeded",
        attempts: 1,
      } as StoredMailMutation,
    ]);
    const first = await importLocalUserWork({ store, drafts, mutations });
    expect(first).toEqual({ imported: 2, skipped: 0, failed: 0 });
    const second = await importLocalUserWork({ store, drafts, mutations });
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(2);
    const operation = await store.readOperation({
      accountId: "acc-1",
      operationId: "mut-archive",
    });
    expect(operation.operation?.status).toBe("queued");
    await store.close();
  });
});
