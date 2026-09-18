import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";

describe("desktop mail utility child process", () => {
  it("forks the child entry and deduplicates commands across messages", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-fork-"));
    const modulePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../src/mail-engine/utility-child.ts",
    );
    const outfile = join(directory, "utility-child.mjs");
    await esbuild.build({
      entryPoints: [modulePath],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
    });
    const child = fork(outfile, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });
    try {
      await send(child, {
        id: "start",
        type: "start",
        databasePath: join(directory, "mailbox.sqlite"),
        origin: "http://127.0.0.1:9",
      });
      const first = await send(child, {
        id: "w1",
        type: "ipc",
        payload: {
          protocolVersion: 1,
          requestId: "w1",
          method: "submitMetadata",
          payload: {
            accountId: "acc-1",
            commandId: "archive-fork",
            targets: [{ accountId: "acc-1", messageId: "m1" }],
            change: { kind: "archive" },
          },
        },
      });
      const second = await send(child, {
        id: "w2",
        type: "ipc",
        payload: {
          protocolVersion: 1,
          requestId: "w2",
          method: "submitMetadata",
          payload: {
            accountId: "acc-1",
            commandId: "archive-fork",
            targets: [{ accountId: "acc-1", messageId: "m1" }],
            change: { kind: "archive" },
          },
        },
      });
      expect(first).toMatchObject({
        status: "ok",
        result: { status: "ok", result: { status: "queued" } },
      });
      expect(second).toMatchObject({
        status: "ok",
        result: { status: "ok", result: { status: "already_recorded" } },
      });
      const inspected = await send(child, {
        id: "inspect",
        type: "ipc",
        payload: {
          protocolVersion: 1,
          requestId: "inspect",
          method: "inspect",
          payload: {},
        },
      });
      expect(inspected).toMatchObject({
        status: "ok",
        result: { status: "ok" },
      });
      await send(child, { id: "close", type: "close" });
    } finally {
      child.kill();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function send(
  child: ReturnType<typeof fork>,
  message: Record<string, unknown>,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const onMessage = (reply: Record<string, unknown>) => {
      if (reply.id !== message.id) return;
      child.off("message", onMessage);
      child.off("exit", onExit);
      resolve(reply);
    };
    const onExit = (code: number | null) => {
      reject(new Error(`child exited ${code}`));
    };
    child.on("message", onMessage);
    child.once("error", reject);
    child.once("exit", onExit);
    child.send(message);
  });
}
