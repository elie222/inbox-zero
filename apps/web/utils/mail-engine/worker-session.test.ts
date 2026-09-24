import { describe, expect, it } from "vitest";
import type { MailEngine } from "@inboxzero/mail-core/engine";
import { createMailWorkerHost } from "./worker-session";
import type { WorkerResponse } from "./worker-protocol";

describe("mail worker account fencing", () => {
  it("rejects a second account while the first engine is still starting", async () => {
    const posts: WorkerResponse[] = [];
    let createCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const host = createMailWorkerHost({
      async createEngine() {
        createCount += 1;
        await gate;
        return stubEngine();
      },
      post: (message) => posts.push(message),
    });

    const first = host.handle({
      id: "start-1",
      type: "start",
      input: { accountId: "acc-1", provider: "google" },
    });
    const second = host.handle({
      id: "start-2",
      type: "start",
      input: { accountId: "acc-2", provider: "microsoft" },
    });
    release();
    await Promise.all([first, second]);

    expect(createCount).toBe(1);
    expect(posts).toEqual([
      { id: "start-1", type: "ok" },
      { id: "start-2", type: "error", message: "account_mismatch" },
    ]);
  });

  it("reuses the running engine for the same account", async () => {
    const posts: WorkerResponse[] = [];
    let createCount = 0;
    const host = createMailWorkerHost({
      async createEngine() {
        createCount += 1;
        return stubEngine();
      },
      post: (message) => posts.push(message),
    });

    await host.handle({
      id: "start-1",
      type: "start",
      input: { accountId: "acc-1", provider: "google" },
    });
    await host.handle({
      id: "start-1b",
      type: "start",
      input: { accountId: "acc-1", provider: "google" },
    });

    expect(createCount).toBe(1);
    expect(posts).toEqual([
      { id: "start-1", type: "ok" },
      { id: "start-1b", type: "ok" },
    ]);
  });

  it("allows a different account after close", async () => {
    const posts: WorkerResponse[] = [];
    const created: string[] = [];
    const host = createMailWorkerHost({
      async createEngine(input) {
        created.push(input.accountId);
        return stubEngine();
      },
      post: (message) => posts.push(message),
    });

    await host.handle({
      id: "start-1",
      type: "start",
      input: { accountId: "acc-1", provider: "google" },
    });
    await host.handle({ id: "close-1", type: "close" });
    await host.handle({
      id: "start-2",
      type: "start",
      input: { accountId: "acc-2", provider: "microsoft" },
    });

    expect(created).toEqual(["acc-1", "acc-2"]);
    expect(posts).toEqual([
      { id: "start-1", type: "ok" },
      { id: "close-1", type: "ok" },
      { id: "start-2", type: "ok" },
    ]);
  });
});

function stubEngine(): MailEngine {
  return {
    async close() {},
  } as MailEngine;
}
