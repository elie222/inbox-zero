import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { UnsubscribeService } from "./service.ts";
import {
  SandboxCleanupUnconfirmed,
  type SandboxAdapter,
  type SandboxInput,
} from "./contracts.ts";

test("concurrent jobs have different capabilities and cannot select each other's model history", async () => {
  const inputs: SandboxInput[] = [];
  const release: (() => void)[] = [];
  const adapter: SandboxAdapter = {
    async create() {
      return {
        async run(input) {
          inputs.push(input);
          await new Promise<void>((resolve) => release.push(resolve));
          return { status: "confirmed" };
        },
        async destroy() {},
      };
    },
  };
  const histories: unknown[] = [];
  const service = new UnsubscribeService({
    adapter,
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 2,
    decide: async (_observation, history) => {
      histories.push([...history]);
      return { action: "needs_user", ref: null, option: null };
    },
  });
  const jobs = [1, 2].map(() =>
    service.execute({
      jobId: randomUUID(),
      url: "https://example.com/unsubscribe",
      recipientEmail: "user@example.com",
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(inputs.length, 2);
  assert.notEqual(inputs[0].token, inputs[1].token);
  await service.decision(inputs[0].token, { text: "a", controls: [] });
  await service.decision(inputs[1].token, { text: "b", controls: [] });
  assert.deepEqual(histories, [[], []]);
  for (const resolve of release) resolve();
  await Promise.all(jobs);
  await assert.rejects(
    service.decision(inputs[0].token, { text: "a", controls: [] }),
  );
});

test("cleans up after a failed run and revokes the job capability", async () => {
  let destroyed = false;
  let token = "";
  const adapter: SandboxAdapter = {
    async create() {
      return {
        async run(input) {
          token = input.token;
          throw new Error("private page content");
        },
        async destroy() {
          destroyed = true;
        },
      };
    },
  };
  const service = new UnsubscribeService({
    adapter,
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 1,
    decide: async () => ({ action: "needs_user", ref: null, option: null }),
  });
  const result = await service.execute({
    jobId: randomUUID(),
    url: "https://example.com/unsubscribe",
    recipientEmail: "user@example.com",
  });
  assert.deepEqual(result, { status: "failed" });
  assert.equal(destroyed, true);
  assert.throws(() => service.authorize(token));
});

test("refuses further work after cleanup cannot be confirmed", async () => {
  const adapter: SandboxAdapter = {
    async create() {
      return {
        async run() {
          return { status: "confirmed" };
        },
        async destroy() {
          throw new Error("cleanup failed");
        },
      };
    },
  };
  const service = new UnsubscribeService({
    adapter,
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 1,
    decide: async () => ({ action: "needs_user", ref: null, option: null }),
  });
  const job = {
    jobId: randomUUID(),
    url: "https://example.com/unsubscribe",
    recipientEmail: "user@example.com",
  };
  assert.deepEqual(await service.execute(job), { status: "failed" });
  await assert.rejects(service.execute({ ...job, jobId: randomUUID() }));
});

test("keeps accepting jobs when sandbox creation fails after confirmed cleanup", async () => {
  let attempts = 0;
  const adapter: SandboxAdapter = {
    async create() {
      attempts++;
      if (attempts === 1) throw new Error("isolation failed");
      return {
        async run() {
          return { status: "needs_user" };
        },
        async destroy() {},
      };
    },
  };
  const service = new UnsubscribeService({
    adapter,
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 1,
    decide: async () => ({ action: "needs_user", ref: null, option: null }),
  });
  const job = {
    jobId: randomUUID(),
    url: "https://example.com/unsubscribe",
    recipientEmail: "user@example.com",
  };
  assert.deepEqual(await service.execute(job), { status: "failed" });
  assert.deepEqual(await service.execute({ ...job, jobId: randomUUID() }), {
    status: "needs_user",
  });
});

test("refuses further work after create cannot confirm cleanup", async () => {
  const adapter: SandboxAdapter = {
    async create() {
      throw new SandboxCleanupUnconfirmed();
    },
  };
  const service = new UnsubscribeService({
    adapter,
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 1,
    decide: async () => ({ action: "needs_user", ref: null, option: null }),
  });
  const job = {
    jobId: randomUUID(),
    url: "https://example.com/unsubscribe",
    recipientEmail: "user@example.com",
  };
  assert.deepEqual(await service.execute(job), { status: "failed" });
  await assert.rejects(service.execute({ ...job, jobId: randomUUID() }));
});

test("client cancellation returns even when a provider ignores abort and destroys a late-created sandbox", async () => {
  let resolveCreate: (
    sandbox: Awaited<ReturnType<SandboxAdapter["create"]>>,
  ) => void = () => {};
  let destroyed = false;
  let ran = false;
  const service = new UnsubscribeService({
    adapter: {
      create: () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    },
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 1,
    decide: async () => ({ action: "needs_user", ref: null, option: null }),
  });
  const controller = new AbortController();
  const result = service.execute(
    {
      jobId: randomUUID(),
      url: "https://example.com",
      recipientEmail: "user@example.com",
    },
    controller.signal,
  );
  controller.abort();
  assert.deepEqual(await result, { status: "failed" });
  resolveCreate({
    run: async () => {
      ran = true;
      return { status: "confirmed" };
    },
    destroy: async () => {
      destroyed = true;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(destroyed, true);
  assert.equal(ran, false);
});
