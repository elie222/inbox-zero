import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeActiveMailEngine,
  getActiveMailClient,
  setActiveMailClient,
} from "./active-client";

describe("closeActiveMailEngine", () => {
  afterEach(() => {
    setActiveMailClient(null);
  });

  it("closes the published client and clears the active handle", async () => {
    const close = vi.fn(async () => undefined);
    setActiveMailClient({ close } as never);
    await closeActiveMailEngine();
    expect(close).toHaveBeenCalledTimes(1);
    expect(getActiveMailClient()).toBeNull();
  });

  it("clears the handle even when close rejects", async () => {
    setActiveMailClient({
      close: async () => {
        throw new Error("already closed");
      },
    } as never);
    await expect(closeActiveMailEngine()).resolves.toBeUndefined();
    expect(getActiveMailClient()).toBeNull();
  });
});
