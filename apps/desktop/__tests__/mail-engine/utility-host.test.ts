import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createChildDesktopMailOwner } from "../../src/mail-engine/utility-host";

describe("desktop mail utility host", () => {
  it("talks to an Electron-shaped child over postMessage", async () => {
    const child = new FakeUtilityChild();
    const owner = await createChildDesktopMailOwner({
      databasePath: "/tmp/mailbox.sqlite",
      origin: "http://127.0.0.1:9",
      fork: (modulePath) => {
        child.modulePath = modulePath;
        return child;
      },
    });
    expect(child.modulePath).toContain("utility-child");
    const result = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "w1",
      method: "submitMetadata",
      payload: { accountId: "acc-1" },
    });
    expect(result).toMatchObject({
      status: "ok",
      result: { status: "queued" },
    });
    await owner.close();
    expect(child.killed).toBe(true);
  });
});

class FakeUtilityChild extends EventEmitter {
  modulePath = "";
  killed = false;

  postMessage(message: unknown) {
    const payload = message as { id: string; type?: string };
    queueMicrotask(() => {
      this.emit("message", {
        id: payload.id,
        status: "ok",
        result:
          payload.type === "ipc"
            ? { status: "ok", result: { status: "queued" } }
            : { started: true },
      });
    });
  }

  kill() {
    this.killed = true;
  }
}
