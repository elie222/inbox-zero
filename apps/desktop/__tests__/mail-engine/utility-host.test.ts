import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChildToMainMessage,
  MainToChildMessage,
} from "../../src/mail-engine/utility-child";
import { createDesktopMailProcessOwner } from "../../src/mail-engine/utility-host";

const ORIGIN = "https://app.example.test";
const OBSERVE = {
  protocolVersion: 1,
  requestId: "observe",
  method: "observeOperation",
  payload: { accountId: "acc-1", operationId: "op-1" },
};
const INSPECT = {
  protocolVersion: 1,
  requestId: "inspect",
  method: "inspect",
  payload: {},
};

afterEach(() => {
  vi.useRealTimers();
});

describe("desktop mail process owner", () => {
  it("routes replies and pushed snapshots, and resubscribes after restarting a crashed child", async () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    const errors: string[] = [];
    const owner = createOwner({
      fork: () => {
        const child = new FakeChild();
        children.push(child);
        return child;
      },
      onEngineError: (error) => errors.push(error.message),
    });
    const snapshots: unknown[] = [];
    const unsubscribe = owner.subscribe(OBSERVE, (snapshot) =>
      snapshots.push(snapshot),
    );
    expect(unsubscribe).toBeTypeOf("function");
    expect(owner.subscribe({ method: "inspect" }, () => undefined)).toBeNull();

    await expect(owner.handleIpc(INSPECT)).resolves.toEqual({
      status: "ok",
      result: "inspect",
    });
    const first = children[0];
    const subscribed = first.sentOfType("subscribe")[0];
    expect(subscribed).toMatchObject({ payload: OBSERVE });
    first.reply({
      type: "snapshot",
      subscriptionId: subscribed.subscriptionId,
      snapshot: { status: "ready" },
    });
    expect(snapshots).toEqual([{ status: "ready" }]);

    first.holdReplies = true;
    const inFlight = owner.handleIpc(INSPECT);
    await vi.waitFor(() => expect(first.sentOfType("ipc")).toHaveLength(2));
    first.exit(1);
    await expect(inFlight).rejects.toThrow("mail engine process exited");
    expect(errors).toEqual([
      "mail engine process exited unexpectedly with code 1",
    ]);
    await expect(owner.handleIpc(INSPECT)).rejects.toThrow("restarting");

    await vi.advanceTimersByTimeAsync(1000);
    const second = children[1];
    await vi.waitFor(() =>
      expect(second.sentOfType("subscribe")).toEqual([subscribed]),
    );
    second.reply({
      type: "snapshot",
      subscriptionId: subscribed.subscriptionId,
      snapshot: { status: "restarted" },
    });
    expect(snapshots.at(-1)).toEqual({ status: "restarted" });

    // A second quick crash backs off longer before restarting.
    second.exit(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(children).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(children).toHaveLength(3);

    unsubscribe?.();
    expect(children[2].sentOfType("unsubscribe")).toEqual([
      { type: "unsubscribe", subscriptionId: subscribed.subscriptionId },
    ]);
    await owner.close();
  });

  it("reports a failed start once and restarts the child", async () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    const errors: string[] = [];
    createOwner({
      fork: () => {
        const child = new FakeChild();
        child.startError = children.length === 0 ? "database is locked" : null;
        children.push(child);
        return child;
      },
      onEngineError: (error) => errors.push(error.message),
    });

    await vi.waitFor(() => expect(children[0].exited).toBe(true));
    expect(errors).toEqual(["database is locked"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(children).toHaveLength(2);
  });

  it("reports a child that exits before starting only as a crash", async () => {
    const child = new FakeChild();
    child.holdReplies = true;
    const errors: string[] = [];
    const owner = createOwner({
      fork: () => child,
      onEngineError: (error) => errors.push(error.message),
    });

    child.exit(9);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toEqual([
      "mail engine process exited unexpectedly with code 9",
    ]);
    await owner.close();
  });

  it("does not report closing before the child has started as an error", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    child.holdReplies = true;
    const errors: string[] = [];
    const owner = createOwner({
      fork: () => child,
      onEngineError: (error) => errors.push(error.message),
    });

    const closed = owner.close();
    await vi.advanceTimersByTimeAsync(5000);
    await closed;
    expect(child.exited).toBe(true);
    expect(errors).toEqual([]);
  });

  it("only gives session cookies to requests for the app origin", async () => {
    const child = new FakeChild();
    const cookieHeader = vi.fn(async () => "session=abc");
    const owner = createOwner({ fork: () => child, cookieHeader });
    await owner.handleIpc(INSPECT);

    child.reply({
      type: "cookieHeaderRequest",
      requestId: "app",
      url: `${ORIGIN}/api/mail/v1/accounts/acc-1/changes`,
    });
    child.reply({
      type: "cookieHeaderRequest",
      requestId: "other",
      url: "https://elsewhere.example.test/api/mail/v1/accounts/acc-1",
    });

    await vi.waitFor(() =>
      expect(child.sentOfType("cookieHeader")).toEqual(
        expect.arrayContaining([
          {
            type: "cookieHeader",
            requestId: "app",
            cookieHeader: "session=abc",
          },
          { type: "cookieHeader", requestId: "other", cookieHeader: "" },
        ]),
      ),
    );
    expect(cookieHeader).toHaveBeenCalledTimes(1);
    await owner.close();
  });

  it("reports child engine errors with their stack", async () => {
    const child = new FakeChild();
    const errors: Error[] = [];
    const owner = createOwner({
      fork: () => child,
      onEngineError: (error) => errors.push(error),
    });
    child.reply({
      type: "engineError",
      message: "sync failed",
      stack: "Error: sync failed\n    at run (engine.ts:1:1)",
    });
    expect(errors[0]?.message).toBe("sync failed");
    expect(errors[0]?.stack).toContain("engine.ts:1:1");
    await owner.close();
  });

  it("closes the engine and waits for the child to exit, without restarting it", async () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    const errors: string[] = [];
    const owner = createOwner({
      fork: () => {
        const child = new FakeChild();
        children.push(child);
        return child;
      },
      onEngineError: (error) => errors.push(error.message),
    });
    await owner.handleIpc(INSPECT);

    await owner.close();
    expect(children[0].sentOfType("close")).toHaveLength(1);
    expect(children[0].exited).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(children).toHaveLength(1);
    expect(errors).toEqual([]);
    await expect(owner.handleIpc(INSPECT)).rejects.toThrow("closed");
  });

  it("kills a child that does not answer close so the mailbox can be wiped", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const owner = createOwner({ fork: () => child });
    await owner.handleIpc(INSPECT);
    child.holdReplies = true;

    const closed = owner.close();
    await vi.advanceTimersByTimeAsync(5000);
    await closed;
    expect(child.exited).toBe(true);
  });
});

function createOwner(
  overrides: Partial<Parameters<typeof createDesktopMailProcessOwner>[0]> & {
    fork: () => FakeChild;
  },
) {
  return createDesktopMailProcessOwner({
    databasePath: "/tmp/mailbox.sqlite",
    origin: ORIGIN,
    cookieHeader: async () => "",
    onEngineError: () => undefined,
    ...overrides,
  });
}

class FakeChild extends EventEmitter {
  sent: MainToChildMessage[] = [];
  holdReplies = false;
  startError: string | null = null;
  exited = false;

  postMessage(message: MainToChildMessage) {
    this.sent.push(message);
    if (this.holdReplies || !("id" in message)) return;
    const { startError } = this;
    if (message.type === "start" && startError) {
      queueMicrotask(() =>
        this.reply({
          type: "reply",
          id: message.id,
          status: "error",
          message: startError,
        }),
      );
      return;
    }
    const result =
      message.type === "ipc" ? { status: "ok", result: "inspect" } : null;
    queueMicrotask(() =>
      this.reply({ type: "reply", id: message.id, status: "ok", result }),
    );
  }

  reply(message: ChildToMainMessage) {
    this.emit("message", message);
  }

  sentOfType<T extends MainToChildMessage["type"]>(type: T) {
    return this.sent.filter(
      (message): message is Extract<MainToChildMessage, { type: T }> =>
        message.type === type,
    );
  }

  exit(code: number) {
    if (this.exited) return;
    this.exited = true;
    this.emit("exit", code);
  }

  kill() {
    this.exit(0);
    return true;
  }
}
