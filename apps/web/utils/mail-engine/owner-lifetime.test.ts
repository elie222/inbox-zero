import { describe, expect, it, vi } from "vitest";
import { holdMailEngineOwner } from "./owner-lifetime";

describe("mail engine ownership", () => {
  it("holds ownership until storage has finished closing", async () => {
    const abort = new AbortController();
    let finishClose!: () => void;
    const closing = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const close = vi.fn(() => closing);
    let released = false;
    const lifetime = holdMailEngineOwner(abort.signal, async () => close).then(
      () => {
        released = true;
      },
    );
    await Promise.resolve();
    abort.abort();
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    expect(released).toBe(false);
    finishClose();
    await lifetime;
    expect(released).toBe(true);
  });

  it("closes an engine whose startup completed after navigation", async () => {
    const abort = new AbortController();
    const close = vi.fn(async () => {});
    let finishStart!: (close: () => Promise<void>) => void;
    const start = new Promise<() => Promise<void>>((resolve) => {
      finishStart = resolve;
    });
    const lifetime = holdMailEngineOwner(abort.signal, () => start);
    abort.abort();
    finishStart(close);
    await lifetime;
    expect(close).toHaveBeenCalledOnce();
  });
});
