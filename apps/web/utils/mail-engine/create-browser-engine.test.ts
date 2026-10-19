import { afterEach, describe, expect, it, vi } from "vitest";
import { captureException } from "@/utils/error";
import { reportMailEngineStartupFailure } from "./startup-failure";
import { createBrowserMailEngine } from "./create-browser-engine";

vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("@/env", () => ({ env: {} }));

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("browser engine startup", () => {
  it.each([
    "NoModificationAllowedError",
    "InvalidStateError",
  ])("retries stale OPFS %s handles in a fresh worker", async (name) => {
    vi.useFakeTimers();
    let attempts = 0;
    const workers: FailingWorker[] = [];
    class HandoverWorker extends FailingWorker {
      constructor() {
        super();
        workers.push(this);
      }
      postMessage(message: { id: string }) {
        const fail = attempts++ < 2;
        queueMicrotask(() =>
          this.listeners.get("message")?.({
            data: fail
              ? {
                  id: message.id,
                  type: "error",
                  stage: "opfs-open",
                  errorName: name,
                  message: "Handle locked",
                }
              : { id: message.id, type: "ok" },
          }),
        );
      }
    }
    vi.stubGlobal("Worker", HandoverWorker);
    const startup = createBrowserMailEngine({
      accountId: "test-account",
      provider: "google",
    });
    await vi.advanceTimersByTimeAsync(5000);
    const engine = await startup;
    expect(workers).toHaveLength(3);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[1].terminate).toHaveBeenCalledOnce();
    expect(workers[2].terminate).not.toHaveBeenCalled();
    await engine.close();
  });

  it("bounds stale handle retries and reports the final failure to Sentry", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempts = 0;
    class LockedWorker extends FailingWorker {
      constructor() {
        super();
        attempts++;
      }
    }
    vi.stubGlobal("Worker", LockedWorker);
    const report = vi.fn((error: unknown) => {
      reportMailEngineStartupFailure(error, {
        runtimeMode: "browser",
        platform: "web",
        capabilities: { worker: true, locks: true, opfs: true },
        stage: "browser-start",
      });
      return error;
    });
    const startup = createBrowserMailEngine({
      accountId: "test-account",
      provider: "google",
    }).catch(report);
    await vi.advanceTimersByTimeAsync(3500);
    expect(report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(await startup).toMatchObject({
      stage: "opfs-open",
      name: "NoModificationAllowedError",
    });
    expect(attempts).toBe(8);
    expect(report).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "opfs-open" }),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: "opfs-open" }),
      }),
    );
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

  it("terminates a worker that stops responding during close", async () => {
    vi.useFakeTimers();
    class StuckCloseWorker extends FailingWorker {
      postMessage(message: { id: string; type?: string }) {
        if (message.type !== "start") return;
        queueMicrotask(() =>
          this.listeners.get("message")?.({
            data: { id: message.id, type: "ok" },
          }),
        );
      }
    }
    vi.stubGlobal("Worker", StuckCloseWorker);
    const engine = await createBrowserMailEngine({
      accountId: "test-account",
      provider: "google",
    });
    const closed = engine.close();
    await vi.advanceTimersByTimeAsync(1000);
    await closed;
    expect(FailingWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it("does not retry permanent OPFS failures", async () => {
    let attempts = 0;
    class QuotaWorker extends FailingWorker {
      constructor() {
        super();
        attempts++;
      }
      postMessage(message: { id: string }) {
        queueMicrotask(() =>
          this.listeners.get("message")?.({
            data: {
              id: message.id,
              type: "error",
              stage: "opfs-open",
              errorName: "QuotaExceededError",
              message: "Storage full",
            },
          }),
        );
      }
    }
    vi.stubGlobal("Worker", QuotaWorker);
    await expect(
      createBrowserMailEngine({
        accountId: "test-account",
        provider: "google",
      }),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(attempts).toBe(1);
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
