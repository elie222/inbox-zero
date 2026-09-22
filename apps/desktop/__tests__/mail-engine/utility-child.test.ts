import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindUtilityChildTransport,
  createUtilityChildRuntime,
} from "../../src/mail-engine/utility-child";

describe("desktop mail utility child", () => {
  it("owns SQLite and deduplicates commands for multiple windows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-child-"));
    const child = createUtilityChildRuntime();
    const started = await child.handle({
      id: "start",
      type: "start",
      databasePath: join(directory, "mailbox.sqlite"),
      origin: "http://127.0.0.1:9",
    });
    expect(started.status).toBe("ok");
    const first = await child.handle({
      id: "w1",
      type: "ipc",
      payload: {
        protocolVersion: 1,
        requestId: "w1",
        method: "submitMetadata",
        payload: {
          accountId: "acc-1",
          commandId: "archive-child",
          targets: [{ accountId: "acc-1", messageId: "m1" }],
          change: { kind: "archive" },
        },
      },
    });
    const second = await child.handle({
      id: "w2",
      type: "ipc",
      payload: {
        protocolVersion: 1,
        requestId: "w2",
        method: "submitMetadata",
        payload: {
          accountId: "acc-1",
          commandId: "archive-child",
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
    await child.handle({ id: "close", type: "close" });
    await rm(directory, { recursive: true, force: true });
  });

  it("replies over Electron parentPort message events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-parent-port-"));
    const parentPort = new EventEmitter() as EventEmitter & {
      postMessage(message: unknown): void;
    };
    const replies: unknown[] = [];
    parentPort.postMessage = (message) => {
      replies.push(message);
    };
    bindUtilityChildTransport(createUtilityChildRuntime(), { parentPort });
    parentPort.emit("message", {
      data: {
        id: "start",
        type: "start",
        databasePath: join(directory, "mailbox.sqlite"),
        origin: "http://127.0.0.1:9",
      },
    });
    await expect
      .poll(() => replies[0])
      .toMatchObject({ id: "start", status: "ok" });
    parentPort.emit("message", {
      data: {
        id: "w1",
        type: "ipc",
        payload: {
          protocolVersion: 1,
          requestId: "w1",
          method: "submitMetadata",
          payload: {
            accountId: "acc-1",
            commandId: "archive-parent-port",
            targets: [{ accountId: "acc-1", messageId: "m1" }],
            change: { kind: "archive" },
          },
        },
      },
    });
    await expect
      .poll(() => replies[1])
      .toMatchObject({
        id: "w1",
        status: "ok",
        result: { status: "ok", result: { status: "queued" } },
      });
    parentPort.emit("message", { data: { id: "close", type: "close" } });
    await expect
      .poll(() => replies[2])
      .toMatchObject({ id: "close", status: "ok" });
    await rm(directory, { recursive: true, force: true });
  });
});
