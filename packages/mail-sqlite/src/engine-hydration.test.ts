import { describe, expect, it, vi } from "vitest";
import {
  createHostRuntime,
  createMailEngine,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const KEY = { accountId: "acc-1", messageId: "m-new" };

describe("engine body hydration across restarts", () => {
  // A reloaded tab starts a new engine on the same database while the old
  // one's body request was still in flight. Its claim must not hold the body
  // back for the rest of the lease.
  it("fetches a body at once after an engine stopped mid-request", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });

    const stopped = new AbortController();
    const firstHydrate = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<Awaited<ReturnType<MailboxSource["hydrate"]>>>(
          (resolve) => {
            signal.addEventListener("abort", () =>
              resolve({
                status: "paused",
                retryAfterMs: 0,
                reason: "unavailable",
              }),
            );
          },
        ),
    );
    const first = createEngine(store, firstHydrate);
    await first.ensureMessageContent(KEY);
    const firstRun = first.runUntil(Date.now() + 5000, stopped.signal);
    await vi.waitFor(() => expect(firstHydrate).toHaveBeenCalled());
    stopped.abort();
    await firstRun;

    const secondHydrate = vi.fn(async () => hydratedBody());
    const second = createEngine(store, secondHydrate);
    await second.ensureMessageContent(KEY);
    await second.runUntil(Date.now() + 500);

    expect(secondHydrate).toHaveBeenCalledWith(
      expect.objectContaining({ keys: [KEY], purpose: "body" }),
    );
    await first.close();
    await second.close();
    await store.close();
  });
});

describe("engine body hydration for the reader", () => {
  it("fetches a conversation's missing bodies in one request", async () => {
    const store = await accountStore();
    const hydrate = vi.fn(async ({ keys }: { keys: (typeof KEY)[] }) =>
      hydratedBodies(keys),
    );
    const engine = createEngine(store, hydrate);
    for (let index = 0; index < 5; index += 1)
      await engine.ensureMessageContent(keyFor(index));

    await engine.runUntil(Date.now() + 500);

    expect(hydrate).toHaveBeenCalledOnce();
    expect(hydrate.mock.calls[0]?.[0].keys).toHaveLength(5);
    await engine.close();
    await store.close();
  });

  // Commands already show their result locally; the body is what the reader
  // is looking at a spinner for.
  it("claims a body someone opened before a queued command", async () => {
    const store = await accountStore();
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Hi",
        editableHtml: "<p>Hi</p>",
        quotedHtml: "",
      },
    });
    if (saved.status !== "saved") throw new Error("expected save");
    await store.admitSend({
      commandId: "send-1",
      draft: { accountId: "acc-1", draftId: "d-1" },
      draftRevision: saved.draftRevision,
      replyTo: null,
    });
    await store.enqueueHydration({
      keys: [KEY],
      purpose: "body",
      priority: "interactive",
    });

    const claim = () =>
      store.claimWork({ ownerId: "owner", nowMs: Date.now(), leaseMs: 30_000 });
    expect((await claim())?.kind).toBe("hydrate");
    expect((await claim())?.kind).toBe("command");
    await store.close();
  });

  it("starts a requested body while sync is still running", async () => {
    const store = await accountStore();
    const hydrate = vi.fn(async ({ keys }: { keys: (typeof KEY)[] }) =>
      hydratedBodies(keys),
    );
    const engine = createMailEngine({
      // Shares the database the test closes itself.
      store: { ...store, async close() {} },
      source: {
        ...idleSource(),
        hydrate,
        // A sync that stays busy for the whole run.
        discoverScopes: ({ signal }) =>
          new Promise((resolve) =>
            signal.addEventListener("abort", () =>
              resolve({
                status: "paused",
                retryAfterMs: 0,
                reason: "unavailable",
              }),
            ),
          ),
      },
      executor: idleExecutor(),
      runtime: createHostRuntime(),
      ownerId: "browser-worker",
    });
    const startedAt = Date.now();
    const run = engine.runUntil(startedAt + 3000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await engine.ensureMessageContent(KEY);

    await vi.waitFor(() => expect(hydrate).toHaveBeenCalled(), {
      timeout: 2000,
    });
    expect(Date.now() - startedAt).toBeLessThan(1500);
    await engine.close();
    await run.catch(() => {});
    await store.close();
  });
});

describe("engine wake-ups", () => {
  // The request lands after the run found nothing to claim but before it
  // starts waiting, the window a wake-up used to be lost in.
  it("does not lose a body request made just before the run waits", async () => {
    const store = await accountStore();
    const hydrate = vi.fn(async ({ keys }: { keys: (typeof KEY)[] }) =>
      hydratedBodies(keys),
    );
    let requested = false;
    let engine: ReturnType<typeof createMailEngine> | undefined;
    engine = createMailEngine({
      store: {
        ...store,
        async close() {},
        async indexSearchBacklog() {
          if (!requested && engine) {
            requested = true;
            await engine.ensureMessageContent(KEY);
          }
          return store.indexSearchBacklog();
        },
      },
      source: { ...idleSource(), hydrate, discoverScopes: busySync },
      executor: idleExecutor(),
      runtime: createHostRuntime(),
      ownerId: "browser-worker",
    });
    const startedAt = Date.now();
    const run = engine.runUntil(startedAt + 3000);

    await vi.waitFor(() => expect(hydrate).toHaveBeenCalled(), {
      timeout: 2000,
    });
    expect(Date.now() - startedAt).toBeLessThan(1500);
    await engine.close();
    await run.catch(() => {});
    await store.close();
  });
});

async function accountStore() {
  const store = await createSqliteMailStore(createNodeSqliteDriver());
  await store.ensureAccount({
    accountId: "acc-1",
    provider: "google",
    generation: "g1",
  });
  return store;
}

function hydratedBodies(
  keys: (typeof KEY)[],
): Awaited<ReturnType<MailboxSource["hydrate"]>> {
  return {
    status: "ok",
    value: {
      changes: [],
      bodies: keys.map((key) => ({
        key,
        version: "1",
        html: null,
        text: "Body",
      })),
      unresolved: [],
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

function createEngine(
  store: Awaited<ReturnType<typeof createSqliteMailStore>>,
  hydrate: MailboxSource["hydrate"],
) {
  return createMailEngine({
    // Both engines share one database, which the test closes itself.
    store: { ...store, async close() {} },
    source: { ...idleSource(), hydrate },
    executor: {
      async execute() {
        return { status: "uncertain", receiptId: null };
      },
      async inspect() {
        return { status: "uncertain", receiptId: null };
      },
    },
    runtime: createHostRuntime(),
    ownerId: "browser-worker",
  });
}

function hydratedBody(): Awaited<ReturnType<MailboxSource["hydrate"]>> {
  return {
    status: "ok",
    value: {
      changes: [],
      bodies: [{ key: KEY, version: "1", html: null, text: "Body" }],
      unresolved: [],
    },
  };
}

function idleSource(): Omit<MailboxSource, "hydrate"> {
  const paused = {
    status: "paused" as const,
    retryAfterMs: 0,
    reason: "unavailable" as const,
  };
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
      return paused;
    },
    async readChanges() {
      return paused;
    },
    async readConversationMembership() {
      return paused;
    },
    async search() {
      return paused;
    },
    async readAttachment() {
      return paused;
    },
  } as Omit<MailboxSource, "hydrate">;
}

function keyFor(index: number) {
  return { accountId: "acc-1", messageId: `m-${index}` };
}

// A sync that stays busy until the run stops, so the run waits on it.
function busySync({ signal }: { signal: AbortSignal }) {
  return new Promise<Awaited<ReturnType<MailboxSource["discoverScopes"]>>>(
    (resolve) =>
      signal.addEventListener("abort", () =>
        resolve({ status: "paused", retryAfterMs: 0, reason: "unavailable" }),
      ),
  );
}
