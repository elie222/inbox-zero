import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserMailEngine } from "./create-browser-engine";

class FailingWorker {
  static latest: FailingWorker;
  listeners = new Map<string, (event: unknown) => void>();
  terminate = vi.fn();
  constructor() {
    FailingWorker.latest = this;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, listener);
  }
  postMessage(message: { id: string }) {
    queueMicrotask(() => {
      this.listeners.get("message")?.({
        data: {
          id: message.id,
          type: "error",
          message: "Access handle is locked",
          stage: "opfs-open",
          errorName: "NoModificationAllowedError",
        },
      });
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("browser engine startup", () => {
  it("preserves the worker startup error and releases its OPFS handles", async () => {
    vi.stubGlobal("Worker", FailingWorker);
    await expect(
      createBrowserMailEngine({
        accountId: "test-account",
        provider: "google",
      }),
    ).rejects.toMatchObject({
      message: "Access handle is locked",
      stage: "opfs-open",
      name: "NoModificationAllowedError",
    });
    expect(FailingWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it("bounds an unresponsive worker and terminates it for retry", async () => {
    vi.useFakeTimers();
    class SilentWorker extends FailingWorker {
      postMessage() {}
    }
    vi.stubGlobal("Worker", SilentWorker);
    const startup = createBrowserMailEngine({
      accountId: "test-account",
      provider: "google",
    });
    const rejection = expect(startup).rejects.toMatchObject({
      stage: "worker-start",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(FailingWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it("reports worker script errors and releases the worker", async () => {
    class BrokenWorker extends FailingWorker {
      postMessage() {
        queueMicrotask(() =>
          this.listeners.get("error")?.({ message: "Module load failed" }),
        );
      }
    }
    vi.stubGlobal("Worker", BrokenWorker);
    await expect(
      createBrowserMailEngine({
        accountId: "test-account",
        provider: "google",
      }),
    ).rejects.toMatchObject({
      stage: "worker-load",
      message: "Module load failed",
    });
    expect(FailingWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it("identifies worker construction failures", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new DOMException("Worker blocked", "SecurityError");
        }
      },
    );
    await expect(
      createBrowserMailEngine({
        accountId: "test-account",
        provider: "google",
      }),
    ).rejects.toMatchObject({
      message: "Worker blocked",
      stage: "worker-load",
    });
  });
});
