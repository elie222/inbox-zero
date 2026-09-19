import { describe, expect, it } from "vitest";
import {
  applyReferenceChange,
  createReferenceModel,
  referenceMailbox,
  setReferencePending,
} from "@inboxzero/mail-core/test-support/reference-model";
import { archiveThenNewMailScenario } from "@inboxzero/mail-core/test-support/scenarios";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createWasmSqliteDriver } from "./wasm-sqlite";

const inboxQuery = {
  accountIds: ["acc-1"],
  predicate: { kind: "role" as const, role: "inbox" as const },
  order: "newest_first" as const,
  pageSize: 10,
  after: null,
};

describe("browser wasm sqlite driver", () => {
  it("runs the shared store on an in-memory sqlite-wasm database", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const view = await store.readMailboxView(inboxQuery);
    expect(view.view.counts.matchingConversations).toBe(0);
    await store.close();
  });

  it("keeps archive and new-mail counts aligned on the wasm driver", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatch("m1", "c1", 1000, ["inbox"]),
          messagePatch("m2", "c2", 2000, ["inbox"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const before = await store.readMailboxView(inboxQuery);
    expect(before.view.counts.matchingConversations).toBe(2);

    const admission = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-c1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(admission.status).toBe("queued");
    const pending = await store.readMailboxView(inboxQuery);
    expect(pending.view.counts.matchingConversations).toBe(1);
    expect(
      pending.view.conversations.map((row) => row.key.conversationId),
    ).toEqual(["c2"]);

    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "new-mail",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [messagePatch("m3", "c1", 3000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const returned = await store.readMailboxView(inboxQuery);
    expect(
      returned.view.conversations.map((row) => row.key.conversationId).sort(),
    ).toEqual(["c1", "c2"]);
    await store.close();
  });

  it("matches the shared archive-then-new-mail fixture on sqlite-wasm", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "a1",
      provider: "google",
      generation: "g1",
    });
    const reference = createReferenceModel();
    for (const event of archiveThenNewMailScenario) {
      if (event.kind === "observe") {
        applyReferenceChange(reference, event.change);
        const requestId =
          "key" in event.change ? event.change.key.messageId : event.change.id;
        await store.applySyncPage({
          ownerId: "owner",
          page: {
            session: { accountId: "a1", generation: "g1" },
            requestId,
            from: { streamId: "primary", generation: "g1", checkpoint: null },
            to: {
              streamId: "primary",
              generation: "g1",
              checkpoint: requestId,
            },
            changes: [event.change],
            requiredHydration: [],
            roundComplete: true,
          },
        });
      }
      if (event.kind === "admit") {
        setReferencePending(reference, [
          ...reference.pending,
          {
            operationId: event.operationId,
            change: event.change,
            targets: event.targets,
          },
        ]);
        await store.admitMetadata({
          accountId: "a1",
          commandId: event.operationId,
          targets: event.targets,
          change: event.change,
        });
      }
      if (event.kind === "clearPending") {
        setReferencePending(
          reference,
          reference.pending.filter(
            (item) => item.operationId !== event.operationId,
          ),
        );
        const operation = await store.readOperation({
          accountId: "a1",
          operationId: event.operationId,
        });
        if (operation.operation) {
          await store.settleAttempt({
            attemptId: "clear",
            operation: {
              key: { accountId: "a1", operationId: event.operationId },
              session: { accountId: "a1", generation: "g1" },
              authority: "backend",
              payloadHash: "x",
              intent: {
                kind: "metadata",
                targets: [{ accountId: "a1", messageId: "m1" }],
                change: { kind: "archive" },
              },
            },
            result: {
              status: "confirmed",
              receiptId: "done",
              observations: [],
              targets: [],
            },
          });
        }
      }
    }
    const view = await store.readMailboxView({
      accountIds: ["a1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    const expected = referenceMailbox(reference, ["a1"], {
      kind: "role",
      role: "inbox",
    });
    expect(view.view.counts.matchingConversations).toBe(
      expected.matchingConversations,
    );
    expect(
      view.view.conversations.map(
        (row) => `${row.key.accountId}:${row.key.conversationId}`,
      ),
    ).toEqual(expected.conversations);
    await store.close();
  });
});

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: conversationId,
      preview: messageId,
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs,
      read: false,
      starred: false,
      folderId: roles.includes("inbox") ? "inbox" : "archive",
      labelIds: roles.includes("inbox") ? ["INBOX"] : [],
      categoryIds: [],
      roles,
      hasAttachments: false,
    },
  };
}
