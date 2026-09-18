import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createUtilityChildRuntime } from "../../src/mail-engine/utility-child";

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
});
