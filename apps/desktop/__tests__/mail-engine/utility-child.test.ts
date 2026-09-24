import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ChildToMainMessage,
  createUtilityChildRuntime,
} from "../../src/mail-engine/utility-child";

describe("desktop mail utility child", () => {
  it("owns SQLite and deduplicates commands for multiple windows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-child-"));
    const { child, replies } = startChild();
    await child.handle({
      type: "start",
      id: "start",
      databasePath: join(directory, "mailbox.sqlite"),
      origin: "http://127.0.0.1:9",
    });
    await child.handle({ type: "ipc", id: "w1", payload: archive("w1") });
    await child.handle({ type: "ipc", id: "w2", payload: archive("w2") });
    expect(replies("w1")).toMatchObject({
      status: "ok",
      result: { status: "ok", result: { status: "queued" } },
    });
    expect(replies("w2")).toMatchObject({
      status: "ok",
      result: { status: "ok", result: { status: "already_recorded" } },
    });
    await child.handle({ type: "close", id: "close" });
    await rm(directory, { recursive: true, force: true });
  });

  it("pushes subscription snapshots to the main process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-child-push-"));
    const { child, sent } = startChild();
    await child.handle({
      type: "start",
      id: "start",
      databasePath: join(directory, "mailbox.sqlite"),
      origin: "http://127.0.0.1:9",
    });
    await child.handle({
      type: "subscribe",
      subscriptionId: "sub-1",
      payload: {
        protocolVersion: 1,
        requestId: "observe",
        method: "observeOperation",
        payload: { accountId: "acc-1", operationId: "archive-child" },
      },
    });
    const snapshots = () =>
      sent.filter(
        (message) =>
          message.type === "snapshot" && message.subscriptionId === "sub-1",
      );
    await expect.poll(() => snapshots().length).toBeGreaterThan(0);

    await child.handle({ type: "ipc", id: "w1", payload: archive("w1") });
    await expect
      .poll(() => snapshots().at(-1))
      .toMatchObject({ snapshot: { data: { status: "queued" } } });

    await child.handle({ type: "close", id: "close" });
    await rm(directory, { recursive: true, force: true });
  });

  it("replies with an error to requests before the engine starts", async () => {
    const { child, replies } = startChild();
    await child.handle({ type: "ipc", id: "early", payload: archive("early") });
    expect(replies("early")).toEqual({
      type: "reply",
      id: "early",
      status: "error",
      message: "mail engine is not started",
    });
  });
});

function startChild() {
  const sent: ChildToMainMessage[] = [];
  const child = createUtilityChildRuntime((message) => sent.push(message));
  return {
    child,
    sent,
    replies: (id: string) =>
      sent.find((message) => message.type === "reply" && message.id === id),
  };
}

function archive(requestId: string) {
  return {
    protocolVersion: 1,
    requestId,
    method: "submitMetadata",
    payload: {
      accountId: "acc-1",
      commandId: "archive-child",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    },
  };
}
