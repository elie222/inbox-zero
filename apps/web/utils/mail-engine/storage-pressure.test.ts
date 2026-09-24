import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BROWSER_STORAGE_PRESSURE_RATIO,
  browserStoragePressure,
} from "./storage-pressure";

describe("browserStoragePressure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is false when StorageManager estimate is missing", async () => {
    vi.stubGlobal("navigator", { storage: {} });
    await expect(browserStoragePressure()).resolves.toBe(false);
  });

  it("is false below the usage ratio and true at or above it", async () => {
    const estimate = vi.fn();
    vi.stubGlobal("navigator", { storage: { estimate } });
    estimate.mockResolvedValueOnce({ usage: 8, quota: 10 });
    await expect(browserStoragePressure()).resolves.toBe(false);
    estimate.mockResolvedValueOnce({
      usage: 9,
      quota: 10,
    });
    await expect(browserStoragePressure()).resolves.toBe(
      9 / 10 >= BROWSER_STORAGE_PRESSURE_RATIO,
    );
    estimate.mockResolvedValueOnce({ usage: 10, quota: 10 });
    await expect(browserStoragePressure()).resolves.toBe(true);
  });

  it("is false when estimate throws or quota is empty", async () => {
    const estimate = vi.fn();
    vi.stubGlobal("navigator", { storage: { estimate } });
    estimate.mockRejectedValueOnce(new Error("denied"));
    await expect(browserStoragePressure()).resolves.toBe(false);
    estimate.mockResolvedValueOnce({ usage: 10, quota: 0 });
    await expect(browserStoragePressure()).resolves.toBe(false);
  });

  it("is false when estimate does not resolve before the timeout", async () => {
    vi.useFakeTimers();
    const estimate = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("navigator", { storage: { estimate } });
    const result = browserStoragePressure();
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(false);
    vi.useRealTimers();
  });
});
