import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchIndexClient } from "./search-index-client";
import type {
  SearchIndexRequest,
  SearchIndexResponse,
} from "./search-index.worker";

const state = vi.hoisted(() => ({
  accounts: new Map<string, { generation: string }>(),
  active: new Set<string>(),
}));
vi.mock("./database", () => ({
  getEmailCacheDatabase: async () => ({
    get: async (_store: string, id: string) => state.accounts.get(id),
    count: async () => state.accounts.size,
  }),
}));
vi.mock("./mail-activation", () => ({
  isMailSyncActivated: (id: string) => state.active.has(id),
}));

const clients: ReturnType<typeof createSearchIndexClient>[] = [];
const channels = new Set<FakeChannel>();
const workers: FakeWorker[] = [];
let held = false;
let respond: (request: SearchIndexRequest, worker: FakeWorker) => void;
let lockRequest: ReturnType<typeof vi.fn>;
const scope = { emailAccountId: "account", generation: "first" };

describe("local search index client", () => {
  beforeEach(() => {
    state.accounts.clear();
    state.active.clear();
    workers.length = 0;
    held = false;
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    lockRequest = vi.fn(
      async (
        _name: string,
        _options: unknown,
        callback: (lock: unknown) => Promise<void>,
      ) => {
        if (held) return callback(null);
        held = true;
        try {
          await callback({ name: "owner" });
        } finally {
          held = false;
        }
      },
    );
    vi.stubGlobal("navigator", {
      locks: { request: lockRequest },
      storage: { getDirectory: vi.fn() },
    });
    respond = (request, worker) =>
      worker.reply({
        id: request.id,
        result:
          request.command === "accounts"
            ? { accounts: [] }
            : request.command === "search"
              ? {
                  status: "ready",
                  revision: 1,
                  messages: [{ id: "message", threadId: "thread", rowId: "1" }],
                }
              : true,
      });
  });
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close());
    await settle();
    channels.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does no work for inert or assistant-only clients", async () => {
    const client = makeClient();
    expect(channels.size).toBe(0);
    expect(lockRequest).not.toHaveBeenCalled();
    state.accounts.set("account", { generation: "first" });
    expect(
      await client.request(scope, {
        command: "state",
        emailAccountId: "account",
      }),
    ).toEqual({ error: "stale" });
    expect(workers).toHaveLength(0);
    expect(channels.size).toBe(0);
    expect(lockRequest).not.toHaveBeenCalled();
  });

  it("forwards two clients through one worker and one lock owner", async () => {
    activate();
    const a = makeClient(),
      b = makeClient();
    const results = await Promise.all([
      a.request(scope, search()),
      b.request(scope, search()),
    ]);
    expect(results.every((result) => "result" in result)).toBe(true);
    expect(workers).toHaveLength(1);
    expect(
      workers[0].requests.filter((request) => request.command === "search"),
    ).toHaveLength(2);
  });

  it("sets the worker storage envelope at the owner instead of trusting RPC senders", async () => {
    activate();
    await makeClient().request(scope, {
      command: "state",
      emailAccountId: "account",
      // Other windows post commands over a channel, so types cannot stop this.
      ...{ storageBudgetBytes: Number.MAX_SAFE_INTEGER },
    });
    expect(
      workers[0].requests.find((request) => request.command === "state")
        ?.storageBudgetBytes,
    ).toBe(500 * 1024 * 1024);
  });
  it("drops a response if the source generation changes during execution", async () => {
    activate();
    const client = makeClient();
    let waiting: SearchIndexRequest | undefined;
    respond = (request, worker) => {
      if (request.command === "search") waiting = request;
      else worker.reply({ id: request.id, result: { accounts: [] } });
    };
    const result = client.request(scope, search());
    await settle();
    expect(waiting).toBeDefined();
    state.accounts.set("account", { generation: "new" });
    workers[0].reply({
      id: waiting!.id,
      result: {
        status: "ready",
        revision: 1,
        messages: [{ id: "stale", threadId: "thread", rowId: "1" }],
      },
    });
    expect(await result).toEqual({ error: "stale" });
  });

  it("bounds pending work and resolves every request when closed", async () => {
    activate();
    respond = () => {};
    const client = makeClient();
    const results = Array.from({ length: 16 }, () =>
      client.request(scope, search()),
    );
    expect(await client.request(scope, search())).toEqual({ error: "busy" });
    await settle();
    client.close();
    expect(await Promise.all(results)).toEqual(
      Array.from({ length: 16 }, () => ({ error: "closed" })),
    );
    expect(workers[0].terminated).toBe(true);
    await settle();
    expect(held).toBe(false);
  });

  it("rechecks queued requests before dispatch after account removal", async () => {
    activate();
    const client = makeClient();
    let waiting: SearchIndexRequest | undefined;
    respond = (request, worker) => {
      if (request.command === "search") waiting = request;
      else worker.reply({ id: request.id, result: { accounts: [] } });
    };
    const first = client.request(scope, search());
    const second = client.request(scope, search());
    await settle();
    state.accounts.delete("account");
    workers[0].reply({
      id: waiting!.id,
      result: { status: "ready", revision: 1, messages: [] },
    });
    expect(await first).toEqual({ error: "stale" });
    expect(await second).toEqual({ error: "stale" });
    expect(
      workers[0].requests.filter((request) => request.command === "search"),
    ).toHaveLength(1);
  });

  it("elects a new owner after shutdown without opening overlapping workers", async () => {
    vi.useFakeTimers();
    activate();
    const owner = makeClient(),
      next = makeClient();
    await owner.request(scope, search());
    const normalResponse = respond;
    respond = (request, worker) => {
      if (request.command !== "search" || worker !== workers[0])
        normalResponse(request, worker);
    };
    const result = next.request(scope, search());
    await settle();
    owner.close();
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toHaveProperty("result");
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers.filter((worker) => !worker.terminated)).toHaveLength(1);
  });

  it("times out a frozen owner without stealing its lock", async () => {
    vi.useFakeTimers();
    activate();
    held = true;
    const client = makeClient();
    const result = client.request(scope, search());
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ error: "timeout" });
    expect(workers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      lockRequest.mock.calls.every(
        (call) => call[1].ifAvailable === true && !call[1].steal,
      ),
    ).toBe(true);
  });

  it("allows explicit cleanup without activation but refuses a current generation", async () => {
    const client = makeClient();
    state.accounts.set("account", { generation: "first" });
    expect(await client.cleanupAccount(scope)).toEqual({ error: "stale" });
    expect(workers).toHaveLength(0);
    state.accounts.delete("account");
    expect(await client.cleanupAccount(scope)).toEqual({ result: true });
    expect(await client.clearAll()).toEqual({ result: true });
    expect(workers[0].terminated).toBe(true);
  });

  it("removes orphaned index accounts before exposing an activated account", async () => {
    activate();
    respond = (request, worker) =>
      worker.reply({
        id: request.id,
        result:
          request.command === "accounts"
            ? {
                accounts: [
                  { emailAccountId: "removed", generation: "old", revision: 1 },
                ],
              }
            : true,
      });
    expect(
      await makeClient().request(scope, {
        command: "state",
        emailAccountId: "account",
      }),
    ).toEqual({ result: true });
    expect(workers[0].requests.map((request) => request.command)).toEqual([
      "accounts",
      "deleteAccount",
      "state",
    ]);
  });

  it("fails honestly when required browser primitives are unavailable", async () => {
    activate();
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(await makeClient().request(scope, search())).toEqual({
      error: "unsupported",
    });
    expect(workers).toHaveLength(0);
  });

  it("recreates a failed worker instead of caching initialization failure", async () => {
    activate();
    const client = makeClient();
    const normalResponse = respond;
    respond = (request, worker) => {
      if (worker === workers[0])
        worker.reply({ id: request.id, error: "unavailable" });
      else normalResponse(request, worker);
    };
    expect(await client.request(scope, search())).toEqual({
      error: "unavailable",
    });
    expect(await client.request(scope, search())).toHaveProperty("result");
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
  });
});

class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(_name: string) {
    channels.add(this);
  }
  postMessage(data: unknown) {
    for (const channel of channels) {
      if (channel !== this)
        queueMicrotask(() => channel.onmessage?.({ data } as MessageEvent));
    }
  }
  close() {
    channels.delete(this);
    this.onmessage = null;
  }
}
class FakeWorker {
  onmessage: ((event: MessageEvent<SearchIndexResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: SearchIndexRequest[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: SearchIndexRequest) {
    this.requests.push(request);
    queueMicrotask(() => {
      if (!this.terminated) respond(request, this);
    });
  }
  reply(data: SearchIndexResponse) {
    queueMicrotask(() => {
      if (!this.terminated)
        this.onmessage?.({ data } as MessageEvent<SearchIndexResponse>);
    });
  }
  terminate() {
    this.terminated = true;
  }
}
function activate() {
  state.accounts.set("account", { generation: "first" });
  state.active.add("account");
}
function makeClient() {
  const client = createSearchIndexClient();
  clients.push(client);
  return client;
}
function search() {
  return {
    command: "search" as const,
    request: { ...scope, query: "message", labels: [] },
  };
}
async function settle() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
