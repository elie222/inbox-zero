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

  it("does not refetch on the initial visible load", () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actFocus();
    actVisibilityChange("visible");

    expect(revalidate).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("refetches once after the tab was hidden", () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");

    expect(revalidate).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("throttles repeated returns to the app", () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    actVisibilityChange("hidden");
    vi.setSystemTime(new Date("2026-09-14T12:00:05.000Z"));
    actVisibilityChange("visible");

    expect(revalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-09-14T12:00:11.000Z"));
    actVisibilityChange("hidden");
    actVisibilityChange("visible");

    expect(revalidate).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not refetch on later focus after the return was already handled", () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    expect(revalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-09-14T12:00:11.000Z"));
    actFocus();

    expect(revalidate).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("still refetches a throttled return once the window elapses", () => {
    const revalidate = vi.fn();
    const unsubscribe = subscribeToVisibleRevalidation(revalidate, 10_000);

    actVisibilityChange("hidden");
    actVisibilityChange("visible");
    expect(revalidate).toHaveBeenCalledOnce();

    actVisibilityChange("hidden");
    vi.setSystemTime(new Date("2026-09-14T12:00:05.000Z"));
    actVisibilityChange("visible");
    expect(revalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-09-14T12:00:11.000Z"));
    actFocus();

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
