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
