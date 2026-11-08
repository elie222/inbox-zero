import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ChildToMainMessage, MainToChildMessage } from "./utility-child";
import {
  createDesktopMailProcessOwner,
  type MailChildProcess,
} from "./utility-host";

describe("desktop mail process notifications", () => {
  it("forwards child sync arrivals without a renderer subscription and ignores late events after close", async () => {
    const child = new TestChild();
    const onNewMail = vi.fn();
    const owner = createDesktopMailProcessOwner({
      databasePath: "mailbox.sqlite",
      origin: "https://app.example.com",
      fork: () => child,
      cookieHeader: async () => "",
      onEngineError: vi.fn(),
      onNewMail,
    });
    const message: ChildToMainMessage = {
      type: "newMail",
      payload: {
        emailAccountId: "account",
        messages: [
          {
            id: "message",
            threadId: "thread",
            receivedAt: 1100,
            from: "ada@example.com",
            subject: "Hello",
          },
        ],
      },
    };
    child.emit("message", message);
    expect(onNewMail).toHaveBeenCalledWith(message.payload);
    await owner.close();
    child.emit("message", message);
    expect(onNewMail).toHaveBeenCalledTimes(1);
  });
});

describe("desktop mail process opening state", () => {
  it("reports opening until the child has opened the mailbox", async () => {
    const child = new HeldStartChild();
    const onOpeningChange = vi.fn();
    const owner = createDesktopMailProcessOwner({
      databasePath: "mailbox.sqlite",
      origin: "https://app.example.com",
      fork: () => child,
      cookieHeader: async () => "",
      onEngineError: vi.fn(),
      onOpeningChange,
    });
    expect(onOpeningChange.mock.calls).toEqual([[true]]);

    child.finishStart();
    await vi.waitFor(() =>
      expect(onOpeningChange.mock.calls).toEqual([[true], [false]]),
    );
    await owner.close();
    expect(onOpeningChange.mock.calls).toEqual([[true], [false]]);
  });

  it("stops reporting opening when the child exits before it opens", async () => {
    const child = new HeldStartChild();
    const onOpeningChange = vi.fn();
    const owner = createDesktopMailProcessOwner({
      databasePath: "mailbox.sqlite",
      origin: "https://app.example.com",
      fork: () => child,
      cookieHeader: async () => "",
      onEngineError: vi.fn(),
      onOpeningChange,
    });
    child.emit("exit", 1);
    expect(onOpeningChange.mock.calls).toEqual([[true], [false]]);
    await owner.close();
    expect(onOpeningChange.mock.calls).toEqual([[true], [false]]);
  });
});

class HeldStartChild extends EventEmitter implements MailChildProcess {
  private startId: string | undefined;
  postMessage(message: MainToChildMessage) {
    if (message.type === "start") this.startId = message.id;
  }
  finishStart() {
    this.emit("message", {
      type: "reply",
      id: this.startId,
      status: "ok",
      result: null,
    });
  }
  kill() {
    this.emit("exit", 0);
    return true;
  }
}

class TestChild extends EventEmitter implements MailChildProcess {
  postMessage(message: MainToChildMessage) {
    if (!("id" in message)) return;
    queueMicrotask(() =>
      this.emit("message", {
        type: "reply",
        id: message.id,
        status: "ok",
        result: null,
      }),
    );
  }
  kill() {
    this.emit("exit", 0);
    return true;
  }
}
