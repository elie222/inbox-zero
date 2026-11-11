import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("engine search and body hydration", () => {
  it("ingests provider search candidates and makes the body queryable", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: searchSource(),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime(),
    });
    const search = engine.observeMailbox({
      accountIds: ["acc-1"],
      predicate: {
        kind: "text",
        field: "body",
        value: "unique-body-token",
        match: "phrase",
      },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await engine.runUntil(Date.now() + 2000);
    await waitForReady(search);
    const snapshot = search.getSnapshot();
    expect(snapshot.data?.counts.matchingConversations).toBe(1);
    expect(snapshot.data?.conversations[0]?.subject).toBe("Invoice");
    const conversation = engine.observeConversation(
      { accountId: "acc-1", conversationId: "c-search" },
      { after: null, pageSize: 10 },
    );
    await waitForReady(conversation);
    const body = conversation.getSnapshot().data?.messages[0]?.content;
    expect(body).toMatchObject({
      status: "available",
      text: "unique-body-token",
    });
    await engine.close();
  });

  it.each([
    "mailbox",
    "window",
  ] as const)("%s stays pending until provider search finishes, including an empty result", async (kind) => {
    const { engine } = await pagedSearchEngine({
      async search() {
        return {
          status: "ok",
          value: { matches: [], nextPage: null, semantics: "exact" },
        };
      },
    });
    const handle =
      kind === "mailbox"
        ? engine.observeMailbox(bodySearchQuery())
        : engine.observeMailboxWindow?.(bodySearchQuery());
    if (!handle) throw new Error("missing mailbox handle");
    await waitForReady(handle);
    expect(handle.getSnapshot().data?.searchStatus).toBe("loading");

    await engine.runUntil(Date.now() + 500);

    expect(handle.getSnapshot().data?.searchStatus).toBe("ready");
    expect(handle.getSnapshot().data?.conversations).toEqual([]);
    await engine.close();
  });

  it("stays pending while provider matches are being hydrated", async () => {
    const gate = deferred();
    let hydrating = false;
    const { engine } = await pagedSearchEngine({
      search: searchSource().search,
      async hydrate(input) {
        hydrating = true;
        await gate.promise;
        return searchSource().hydrate(input);
      },
    });
    const handle = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!handle) throw new Error("missing mailbox handle");
    await waitForReady(handle);
    const run = engine.runUntil(Date.now() + 2000);
    try {
      await expect.poll(() => hydrating).toBe(true);
      expect(handle.getSnapshot().data?.searchStatus).toBe("loading");
    } finally {
      gate.resolve();
      await run;
    }
    expect(handle.getSnapshot().data?.searchStatus).toBe("ready");
    expect(handle.getSnapshot().data?.conversations[0]?.subject).toBe(
      "Invoice",
    );
    await engine.close();
  });

  it("reports provider failure instead of a successful empty search", async () => {
    const { engine } = await pagedSearchEngine({
      async search() {
        return {
          status: "paused",
          retryAfterMs: 60_000,
          reason: "unavailable",
        };
      },
    });
    const handle = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!handle) throw new Error("missing mailbox handle");
    await engine.runUntil(Date.now() + 500);
    await waitForReady(handle);
    expect(handle.getSnapshot().data?.searchStatus).toBe("error");
    await engine.close();
  });

  it("restarts a failed provider search when its window is observed again", async () => {
    const { engine } = await pagedSearchEngine({
      async search() {
        return {
          status: "paused",
          retryAfterMs: 60_000,
          reason: "unavailable",
        };
      },
    });
    const first = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!first) throw new Error("missing mailbox handle");
    await engine.runUntil(Date.now() + 500);
    expect(first.getSnapshot().data?.searchStatus).toBe("error");
    first.close();
    const retry = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!retry) throw new Error("missing mailbox handle");
    await waitForReady(retry);
    expect(retry.getSnapshot().data?.searchStatus).toBe("loading");
    await engine.close();
  });

  it("reports a thrown provider error to the active search", async () => {
    const { engine } = await pagedSearchEngine({
      async search() {
        throw new Error("provider unavailable");
      },
    });
    const handle = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!handle) throw new Error("missing mailbox handle");
    await expect(engine.runUntil(Date.now() + 500)).rejects.toThrow(
      "provider unavailable",
    );
    expect(handle.getSnapshot().data?.searchStatus).toBe("error");
    await engine.close();
  });

  it("reports unavailable provider matches instead of completing the search", async () => {
    const { engine } = await pagedSearchEngine({
      search: searchSource().search,
      async hydrate({ keys }) {
        return {
          status: "ok",
          value: {
            changes: [],
            bodies: [],
            unresolved: keys.map((key) => ({ key, reason: "unavailable" })),
          },
        };
      },
    });
    const handle = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!handle) throw new Error("missing mailbox handle");
    await engine.runUntil(Date.now() + 500);
    expect(handle.getSnapshot().data?.searchStatus).toBe("error");
    expect(handle.getSnapshot().data?.conversations).toEqual([]);
    await engine.close();
  });

  it("fetches another provider search page only when the view asks for more", async () => {
    const { engine, searchedPages } = await pagedSearchEngine();
    const search = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!search) throw new Error("missing mailbox window handle");
    await engine.runUntil(Date.now() + 500);
    await engine.runUntil(Date.now() + 500);

    expect(searchedPages).toEqual([null]);

    await search.loadMore();
    await engine.runUntil(Date.now() + 500);
    await engine.runUntil(Date.now() + 500);

    expect(searchedPages).toEqual([null, "page-1"]);
    await engine.close();
  });

  it("does not continue a search page left queued from an earlier session", async () => {
    const { engine, store, searchedPages } = await pagedSearchEngine();
    await store.enqueueSearch({
      accountId: "acc-1",
      predicate: bodySearchQuery().predicate,
      page: "page-5",
    });
    await engine.runUntil(Date.now() + 500);
    await engine.runUntil(Date.now() + 500);

    expect(searchedPages).toEqual(["page-5"]);
    await engine.close();
  });

  it("continues from the view's own page, not one left from an earlier session", async () => {
    const { engine, store, searchedPages } = await pagedSearchEngine();
    await store.enqueueSearch({
      accountId: "acc-1",
      predicate: bodySearchQuery().predicate,
      page: "page-5",
    });
    const search = engine.observeMailboxWindow?.(bodySearchQuery());
    if (!search) throw new Error("missing mailbox window handle");
    await engine.runUntil(Date.now() + 500);
    await engine.runUntil(Date.now() + 500);

    await search.loadMore();
    await engine.runUntil(Date.now() + 500);
    await engine.runUntil(Date.now() + 500);

    expect([...searchedPages].sort()).toEqual(
      [null, "page-1", "page-5"].sort(),
    );
    expect(searchedPages.at(-1)).toBe("page-1");
    await engine.close();
  });
});

async function pagedSearchEngine(sourceOverrides: Partial<MailboxSource> = {}) {
  const store = await createSqliteMailStore(createNodeSqliteDriver());
  await store.ensureAccount({
    accountId: "acc-1",
    provider: "google",
    generation: "g1",
  });
  const searchedPages: Array<string | null> = [];
  const engine = createMailEngine({
    store,
    source: {
      ...searchSource(),
      async search({ page }) {
        searchedPages.push(page);
        const next = page ? Number(page.replace("page-", "")) + 1 : 1;
        return {
          status: "ok",
          value: {
            matches: [],
            nextPage: `page-${next}`,
            semantics: "candidates_require_local_filter",
          },
        };
      },
      ...sourceOverrides,
    },
    executor: {
      async execute() {
        return { status: "uncertain", receiptId: null };
      },
      async inspect() {
        return { status: "uncertain", receiptId: null };
      },
    },
    runtime: createHostRuntime(),
  });
  return { engine, store, searchedPages };
}

function bodySearchQuery() {
  return {
    accountIds: ["acc-1"],
    predicate: {
      kind: "text" as const,
      field: "body" as const,
      value: "unique-body-token",
      match: "phrase" as const,
    },
    order: "newest_first" as const,
    pageSize: 25,
    after: null,
  };
}

async function waitForReady(handle: { getSnapshot: () => { status: string } }) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (handle.getSnapshot().status === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function searchSource(): MailboxSource {
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 10,
          maxHydrationBatch: 10,
        },
      };
    },
    async discoverScopes() {
      return { status: "ok", value: { scopes: [], nextPage: null } };
    },
    async beginBootstrap() {
      return {
        status: "ok",
        value: { bootstrapId: "x", enumerationToken: "{}", catchUpFrom: null },
      };
    },
    async enumerate() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readChanges() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return {
        status: "ok",
        value: {
          changes: [
            {
              kind: "message_patch",
              key: { accountId: "acc-1", messageId: "m-search" },
              reference: {
                provider: "google",
                messageId: "m-search",
                conversationId: "c-search",
                version: "1",
              },
              fields: {
                subject: "Invoice",
                preview: "unique-body-token",
                from: "ada@example.com",
                to: ["me@example.com"],
                cc: [],
                receivedAtMs: 1000,
                read: false,
                starred: false,
                folderId: "inbox",
                labelIds: ["INBOX"],
                categoryIds: [],
                roles: ["inbox"],
                hasAttachments: false,
              },
            },
          ],
          bodies: [
            {
              key: { accountId: "acc-1", messageId: "m-search" },
              version: "1",
              html: null,
              text: "unique-body-token",
            },
          ],
          unresolved: [],
        },
      };
    },
    async readConversationMembership() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async search() {
      return {
        status: "ok",
        value: {
          matches: [{ accountId: "acc-1", messageId: "m-search" }],
          nextPage: null,
          semantics: "candidates_require_local_filter",
        },
      };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
