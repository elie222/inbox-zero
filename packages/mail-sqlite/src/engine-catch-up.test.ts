import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const session = { accountId: "acc-1", generation: "g1" };

describe("engine catch-up after a long gap", () => {
  it("shows the newest mail before replaying a long change history", async () => {
    const store = await storeWithCheckpoint("h-0");
    const source = historySource({ historyPages: 40 });
    const engine = createMailEngine({
      store,
      source: source.port,
      executor: idleExecutor(),
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });

    for (let run = 0; run < 3; run += 1) {
      await engine.runUntil(Date.now() + 2000);
    }

    expect(await inboxSubjects(store)).toContain("newest");
    expect(source.historyReads()).toBeLessThan(40);

    for (let run = 0; run < 45; run += 1) {
      await engine.runUntil(Date.now() + 2000);
    }

    // The newest page does not move the checkpoint, so the replay still
    // covers every older change and finishes where the history ends.
    expect(source.historyReads()).toBe(40);
    expect(source.newestPageReads()).toBe(1);
    expect(await streamCheckpoint(store)).toBe("h-40");
    expect(await inboxSubjects(store)).toEqual(
      expect.arrayContaining(["newest", "old-1", "old-39"]),
    );
    await engine.close();
  });

  it("retries the newest page after a failed fetch", async () => {
    const store = await storeWithCheckpoint("h-0");
    const source = historySource({ historyPages: 40, failedNewestReads: 1 });
    const engine = createMailEngine({
      store,
      source: source.port,
      executor: idleExecutor(),
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });

    for (let run = 0; run < 6; run += 1) {
      await engine.runUntil(Date.now() + 2000);
    }

    expect(source.newestPageReads()).toBe(2);
    expect(await inboxSubjects(store)).toContain("newest");
    expect(source.historyReads()).toBeLessThan(40);
    await engine.close();
  });

  it("replays a short backlog without fetching the newest page", async () => {
    const store = await storeWithCheckpoint("h-0");
    const source = historySource({ historyPages: 2 });
    const engine = createMailEngine({
      store,
      source: source.port,
      executor: idleExecutor(),
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });

    for (let run = 0; run < 4; run += 1) {
      await engine.runUntil(Date.now() + 2000);
    }

    expect(await streamCheckpoint(store)).toBe("h-2");
    expect(await inboxSubjects(store)).toContain("newest");
    expect(source.newestPageReads()).toBe(0);
    await engine.close();
  });
});

async function storeWithCheckpoint(checkpoint: string) {
  const store = await createSqliteMailStore(createNodeSqliteDriver());
  await store.ensureAccount({
    accountId: session.accountId,
    provider: "google",
    generation: session.generation,
  });
  await store.applySyncPage({
    ownerId: "test",
    page: {
      session,
      requestId: "seed",
      from: { streamId: "primary", generation: "g1", checkpoint: null },
      to: { streamId: "primary", generation: "g1", checkpoint },
      changes: [],
      requiredHydration: [],
      roundComplete: true,
    },
  });
  return store;
}

async function inboxSubjects(
  store: Awaited<ReturnType<typeof createSqliteMailStore>>,
) {
  const { view } = await store.readMailboxView({
    accountIds: [session.accountId],
    predicate: { kind: "role", role: "inbox" },
    order: "newest_first",
    pageSize: 100,
    after: null,
  });
  return view.conversations.map((conversation) => conversation.subject);
}

async function streamCheckpoint(
  store: Awaited<ReturnType<typeof createSqliteMailStore>>,
) {
  const [account] = await store.readAccountSyncStates();
  return account?.streams.find((stream) => stream.streamId === "primary")
    ?.checkpoint;
}

// Change history replays oldest first: each page holds one older change, and
// the newest message only arrives on the last page.
function historySource({
  historyPages,
  failedNewestReads = 0,
}: {
  historyPages: number;
  failedNewestReads?: number;
}) {
  let historyReads = 0;
  let newestPageReads = 0;
  const port: MailboxSource = {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 50,
          maxHydrationBatch: 20,
        },
      };
    },
    async discoverScopes() {
      return {
        status: "ok",
        value: {
          scopes: [{ id: "primary", kind: "account", folderId: null }],
          nextPage: null,
        },
      };
    },
    async beginBootstrap() {
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          enumerationToken: "newest",
          catchUpFrom: null,
        },
      };
    },
    async enumerate() {
      newestPageReads += 1;
      if (newestPageReads <= failedNewestReads) {
        return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
      }
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          scopeId: "primary",
          changes: [inboxMessage("newest", 10_000)],
          requiredHydration: [],
          bodies: [],
          nextPage: "older",
          catchUpFrom: null,
        },
      };
    },
    async readChanges({ position, requestId }) {
      historyReads += 1;
      const index = Number(position.checkpoint?.slice("h-".length));
      const next = index + 1;
      const last = next === historyPages;
      return {
        status: "page",
        page: {
          session,
          requestId,
          from: position,
          to: { ...position, checkpoint: `h-${next}` },
          changes: [
            last
              ? inboxMessage("newest", 10_000)
              : inboxMessage(`old-${next}`, next),
          ],
          requiredHydration: [],
          roundComplete: last,
        },
      };
    },
    async hydrate() {
      return {
        status: "ok",
        value: { changes: [], bodies: [], unresolved: [] },
      };
    },
    async readConversationMembership() {
      return { status: "ok", value: { status: "unsupported" } };
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
  return {
    port,
    historyReads: () => historyReads,
    newestPageReads: () => newestPageReads,
  };
}

function inboxMessage(
  messageId: string,
  receivedAtMs: number,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: session.accountId, messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId: `c-${messageId}`,
      version: "1",
    },
    fields: {
      subject: messageId,
      preview: messageId,
      from: "sender@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs,
      read: false,
      starred: false,
      folderId: "inbox",
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
}

function idleExecutor() {
  return {
    async execute() {
      return { status: "uncertain" as const, receiptId: null };
    },
    async inspect() {
      return { status: "uncertain" as const, receiptId: null };
    },
  };
}
