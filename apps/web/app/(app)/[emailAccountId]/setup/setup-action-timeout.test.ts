import { afterEach, describe, expect, it, vi } from "vitest";
import { withSetupActionTimeout } from "./setup-action-timeout";

describe("withSetupActionTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an action result that settles before the timeout", async () => {
    await expect(
      withSetupActionTimeout(Promise.resolve({ success: true }), 1000),
    ).resolves.toEqual({ success: true });
  });

  it("preserves an action failure that occurs before the timeout", async () => {
    const error = new Error("Network request failed");

    await expect(
      withSetupActionTimeout(Promise.reject(error), 1000),
    ).rejects.toBe(error);
  });

  it("rejects when an action does not settle before the timeout", async () => {
    vi.useFakeTimers();
    const result = withSetupActionTimeout(
      new Promise<never>(() => undefined),
      1000,
    );
    const expectation = expect(result).rejects.toThrow(
      "Setup action timed out",
    );

    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
  });
});
