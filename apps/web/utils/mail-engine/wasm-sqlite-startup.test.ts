import { afterEach, describe, expect, it, vi } from "vitest";
import initSqlite from "@sqlite.org/sqlite-wasm";
import { createWasmSqliteDriver } from "./wasm-sqlite";

vi.mock("@sqlite.org/sqlite-wasm", () => ({ default: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("SQLite startup failures", () => {
  it("identifies WASM initialization failures", async () => {
    vi.mocked(initSqlite).mockRejectedValue(
      new WebAssembly.CompileError("Invalid WASM"),
    );
    await expect(createWasmSqliteDriver()).rejects.toMatchObject({
      stage: "wasm-init",
      message: "Invalid WASM",
    });
  });

  it.each([
    "NoModificationAllowedError",
    "QuotaExceededError",
  ])("preserves OPFS %s failures without opening an in-memory database", async (name) => {
    const memory = vi.fn();
    vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } });
    vi.mocked(initSqlite).mockResolvedValue({
      installOpfsSAHPoolVfs: vi
        .fn()
        .mockRejectedValue(new DOMException("Cannot open OPFS", name)),
      oo1: { DB: memory },
    } as unknown as Awaited<ReturnType<typeof initSqlite>>);
    await expect(createWasmSqliteDriver()).rejects.toMatchObject({
      stage: "opfs-open",
      name,
      message: "Cannot open OPFS",
    });
    expect(memory).not.toHaveBeenCalled();
  });
});
