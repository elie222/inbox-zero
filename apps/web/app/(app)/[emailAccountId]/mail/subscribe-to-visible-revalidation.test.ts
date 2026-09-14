/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToVisibleRevalidation } from "./subscribe-to-visible-revalidation";

const visibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState",
);

describe("subscribeToVisibleRevalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreVisibility();
  });

  it("does not refetch on the initial visible load", async () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actFocus();
    actVisibilityChange("visible");
    await flushRevalidate();

    expect(revalidate).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("refetches once after the tab was hidden", async () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await flushRevalidate();

    expect(revalidate).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("throttles repeated returns to the app", async () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await flushRevalidate();
    actVisibilityChange("hidden");
    vi.setSystemTime(new Date("2026-09-14T12:00:05.000Z"));
    actVisibilityChange("visible");
    await flushRevalidate();

    expect(revalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-09-14T12:00:11.000Z"));
    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await flushRevalidate();

    expect(revalidate).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not refetch on later focus after the return was already handled", async () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await flushRevalidate();
    expect(revalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-09-14T12:00:11.000Z"));
    actFocus();
    await flushRevalidate();

    expect(revalidate).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("still refetches a throttled return once the window elapses", async () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await flushRevalidate();
    expect(revalidate).toHaveBeenCalledOnce();

    actVisibilityChange("hidden");
    vi.setSystemTime(new Date("2026-09-14T12:00:05.000Z"));
    actVisibilityChange("visible");
    await flushRevalidate();
    expect(revalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-09-14T12:00:11.000Z"));
    actFocus();
    await flushRevalidate();

    expect(revalidate).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not start a second refetch while one is in flight", async () => {
    let resolveFirst: (() => void) | undefined;
    const revalidate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await Promise.resolve();
    actFocus();
    await Promise.resolve();

    expect(revalidate).toHaveBeenCalledOnce();

    resolveFirst?.();
    await flushRevalidate();
    unsubscribe();
  });

  it("retries after a failed refetch", async () => {
    const revalidate = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    await flushRevalidate();
    expect(revalidate).toHaveBeenCalledOnce();

    actFocus();
    await flushRevalidate();

    expect(revalidate).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

function actVisibilityChange(state: DocumentVisibilityState) {
  setVisibility(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

function actFocus() {
  window.dispatchEvent(new Event("focus"));
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function restoreVisibility() {
  if (visibilityDescriptor) {
    Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    return;
  }
  // jsdom's default is a data property we replaced for the test.
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
}

async function flushRevalidate() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
