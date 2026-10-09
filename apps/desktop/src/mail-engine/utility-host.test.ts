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
