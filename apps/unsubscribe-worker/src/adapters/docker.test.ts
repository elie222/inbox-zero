import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dockerAdapter } from "./docker.ts";
import { SandboxCleanupUnconfirmed } from "../contracts.ts";

test("requires a host expiry timer and gVisor, with no volumes or inherited secrets", async () => {
  const calls: { binary: string; args: string[]; input?: string }[] = [];
  const adapter = dockerAdapter({
    image: "runner:test",
    routerImage: "router:test",
    command: async (binary, args, options) => {
      calls.push({ binary, args, input: options?.input });
      if (args.includes("--interactive")) return '{"status":"confirmed"}';
      return "";
    },
  });
  const jobId = randomUUID();
  const sandbox = await adapter.create({
    jobId,
    brokerIp: "8.8.8.8",
    brokerPort: 443,
    signal: new AbortController().signal,
  });
  await sandbox.run(
    {
      jobId,
      url: "https://example.com",
      recipientEmail: "user@example.com",
      brokerUrl: "https://broker.example.com",
      brokerIp: "8.8.8.8",
      token: "test-token",
    },
    new AbortController().signal,
  );
  await sandbox.destroy();
  assert.equal(calls[0].binary, "systemd-run");
  const run = calls.find(({ args }) => args.includes("--interactive"));
  assert.ok(run);
  assert.ok(run.args.includes("--runtime=runsc"));
  assert.ok(
    run.args.includes(`--network=container:unsubscribe-${jobId}-router`),
  );
  assert.ok(run.args.includes("--read-only"));
  assert.ok(
    !run.args.some(
      (arg) =>
        arg.includes("test-token") ||
        arg.includes("user@example.com") ||
        arg === "--volume" ||
        arg === "--privileged",
    ),
  );
  assert.ok(run.input);
  assert.equal(JSON.parse(run.input).token, "test-token");
});

test("never starts a sandbox if independent expiry cannot be scheduled", async () => {
  const commands: string[] = [];
  const adapter = dockerAdapter({
    image: "runner:test",
    routerImage: "router:test",
    command: async (binary) => {
      commands.push(binary);
      throw new Error("timer unavailable");
    },
  });
  await assert.rejects(
    adapter.create({
      jobId: randomUUID(),
      brokerIp: "8.8.8.8",
      brokerPort: 443,
      signal: new AbortController().signal,
    }),
  );
  assert.deepEqual(commands, ["systemd-run"]);
});

test("rejects with a normal error when creation fails after confirmed cleanup", async () => {
  const adapter = dockerAdapter({
    image: "runner:test",
    routerImage: "router:test",
    command: async (binary, args) => {
      if (binary === "systemd-run") return "";
      if (args.includes("--detach")) throw new Error("router failed");
      return "";
    },
  });
  await assert.rejects(
    adapter.create({
      jobId: randomUUID(),
      brokerIp: "8.8.8.8",
      brokerPort: 443,
      signal: new AbortController().signal,
    }),
    { message: "Sandbox creation failed" },
  );
});

test("throws unconfirmed cleanup when destroy fails after a creation error", async () => {
  const adapter = dockerAdapter({
    image: "runner:test",
    routerImage: "router:test",
    command: async (binary, args) => {
      if (binary === "systemd-run") return "";
      if (args.includes("--detach")) throw new Error("router failed");
      throw new Error("lookup failed");
    },
  });
  await assert.rejects(
    adapter.create({
      jobId: randomUUID(),
      brokerIp: "8.8.8.8",
      brokerPort: 443,
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof SandboxCleanupUnconfirmed,
  );
});
