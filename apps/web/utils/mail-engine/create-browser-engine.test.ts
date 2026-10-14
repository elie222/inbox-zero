import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserMailEngine } from "./create-browser-engine";
import { createWasmSqliteDriver } from "./wasm-sqlite";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

vi.mock("./wasm-sqlite", () => ({ createWasmSqliteDriver: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("browser engine startup", () => {
  it("terminates a worker immediately when its page leaves during startup", async () => {
    const terminate = vi.fn();
    vi.stubGlobal(
      "Worker",
      class {
        addEventListener() {}
        postMessage() {}
        terminate = terminate;
      },
    );
    const abort = new AbortController();
    const opening = createBrowserMailEngine(
      { accountId: "a", provider: "icloud" },
      abort.signal,
    );
    const rejected = expect(opening).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejected;
    expect(terminate).toHaveBeenCalledOnce();
    expect(createWasmSqliteDriver).not.toHaveBeenCalled();
  });

  it("releases a running worker on page departure without waiting for a close reply", async () => {
    const { terminate } = stubWorkers([{ type: "ok" }]);
    const abort = new AbortController();
    const engine = await createBrowserMailEngine(
      { accountId: "a", provider: "icloud" },
      abort.signal,
    );
    abort.abort();
    expect(terminate).toHaveBeenCalledOnce();
    await engine.close();
    expect(terminate).toHaveBeenCalledOnce();
    await expect(engine.getDiagnostics("a")).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("terminates a failed worker before opening explicitly nonpersistent fallback storage", async () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const terminate = vi.fn();
    vi.stubGlobal(
      "Worker",
      class {
        addEventListener(type: string, listener: (event: unknown) => void) {
          listeners.set(type, listener);
        }
        postMessage(message: WorkerRequest) {
          const response: WorkerResponse = {
            id: message.id,
            type: "error",
            message: "startup failed",
          };
          queueMicrotask(() => listeners.get("message")?.({ data: response }));
        }
        terminate = terminate;
      },
    );
    vi.mocked(createWasmSqliteDriver).mockImplementation(async () => {
      expect(terminate).toHaveBeenCalledOnce();
      throw new Error("fallback reached after worker cleanup");
    });

    await expect(
      createBrowserMailEngine({
        accountId: "a",
        provider: "icloud",
        persist: false,
      }),
    ).rejects.toThrow("fallback reached after worker cleanup");
  });

  it("preserves a persistent worker failure instead of masking it with a main-thread storage error", async () => {
    const { terminate } = stubWorkers([
      {
        type: "error",
        message: "database is locked",
        errorName: "SqliteError",
      },
    ]);
    await expect(
      createBrowserMailEngine({ accountId: "a", provider: "icloud" }),
    ).rejects.toMatchObject({
      name: "SqliteError",
      message: "database is locked",
    });
    expect(terminate).toHaveBeenCalledOnce();
    expect(createWasmSqliteDriver).not.toHaveBeenCalled();
  });

  it("retries a transient file-lock failure with a fresh worker", async () => {
    vi.useFakeTimers();
    const { terminate, started } = stubWorkers([
      {
        type: "error",
        message: "File handle is still closing",
        errorName: "UnknownError",
      },
      { type: "ok" },
    ]);
    const opening = createBrowserMailEngine({
      accountId: "a",
      provider: "icloud",
    });
    await vi.runAllTimersAsync();
    const engine = await opening;
    expect(started).toHaveLength(2);
    expect(terminate).toHaveBeenCalledOnce();
    expect(createWasmSqliteDriver).not.toHaveBeenCalled();
    await engine.close();
  });

  it("bounds retries when the browser cannot open persistent storage", async () => {
    vi.useFakeTimers();
    const { terminate, started } = stubWorkers(
      Array.from({ length: 4 }, () => ({
        type: "error" as const,
        message: "Storage unavailable",
        errorName: "UnknownError",
      })),
    );
    const failed = expect(
      createBrowserMailEngine({ accountId: "a", provider: "icloud" }),
    ).rejects.toMatchObject({
      name: "UnknownError",
      message: "Storage unavailable",
    });
    await vi.runAllTimersAsync();
    await failed;
    expect(started).toHaveLength(4);
    expect(terminate).toHaveBeenCalledTimes(4);
  });
});

function stubWorkers(
  results: Array<Omit<Extract<WorkerResponse, { type: "error" | "ok" }>, "id">>,
) {
  const terminate = vi.fn();
  const started: string[] = [];
  vi.stubGlobal(
    "Worker",
    class {
      listeners = new Map<string, (event: unknown) => void>();
      addEventListener(type: string, listener: (event: unknown) => void) {
        this.listeners.set(type, listener);
      }
      postMessage(message: WorkerRequest) {
        if (message.type === "start") started.push(message.input.accountId);
        const result =
          message.type === "start" ? results.shift() : { type: "ok" };
        queueMicrotask(() =>
          this.listeners.get("message")?.({
            data: { id: message.id, ...result },
          }),
        );
      }
      terminate = terminate;
    },
  );
  return { terminate, started };
}
