import { describe, expect, it, vi } from "vitest";
import {
  browserMailEngineCapabilities,
  readPageMaxPendingOperations,
  requestSyncUnlessOffline,
  workerStartFence,
  shouldReleaseDeferredOnStart,
} from "./worker-protocol";

describe("browser mail engine capabilities", () => {
  it("reports worker and OPFS support from the current runtime", () => {
    const capabilities = browserMailEngineCapabilities();
    expect(capabilities).toEqual({
      worker: typeof Worker !== "undefined",
      locks:
        typeof navigator !== "undefined" &&
        Boolean((navigator as Navigator & { locks?: unknown }).locks),
      opfs:
        typeof navigator !== "undefined" &&
        "storage" in navigator &&
        "getDirectory" in navigator.storage,
    });
  });
});

describe("worker account fencing", () => {
  it("allows the first account and the same account again", () => {
    expect(workerStartFence(undefined, "acc-1")).toBeNull();
    expect(workerStartFence("acc-1", "acc-1")).toBeNull();
  });

  it("rejects a second account on an already started worker", () => {
    expect(workerStartFence("acc-1", "acc-2")).toBe("account_mismatch");
  });
});

describe("page pending-operation cap", () => {
  it("returns undefined when window is not present", () => {
    expect(readPageMaxPendingOperations()).toBeUndefined();
  });
});

describe("deferred release on engine start", () => {
  it("releases connectivity holds when the page is online", () => {
    expect(shouldReleaseDeferredOnStart()).toBe(true);
    expect(shouldReleaseDeferredOnStart(true)).toBe(true);
  });

  it("keeps connectivity holds when the page is offline", () => {
    expect(shouldReleaseDeferredOnStart(false)).toBe(false);
  });
});

describe("requestSyncUnlessOffline", () => {
  it("does not release deferred operations while the page is offline", async () => {
    const sync = vi.fn(async () => ({ status: "scheduled" as const }));
    await expect(requestSyncUnlessOffline(false, sync)).resolves.toEqual({
      status: "scheduled",
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it("releases deferred operations when the page is online", async () => {
    const sync = vi.fn(async () => ({ status: "scheduled" as const }));
    await expect(requestSyncUnlessOffline(true, sync)).resolves.toEqual({
      status: "scheduled",
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("releases deferred operations when connectivity is unknown", async () => {
    const sync = vi.fn(async () => ({ status: "scheduled" as const }));
    await expect(requestSyncUnlessOffline(undefined, sync)).resolves.toEqual({
      status: "scheduled",
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("preserves an already_satisfied admission from the inner sync", async () => {
    const sync = vi.fn(async () => ({
      status: "already_satisfied" as const,
    }));
    await expect(requestSyncUnlessOffline(true, sync)).resolves.toEqual({
      status: "already_satisfied",
    });
  });
});
