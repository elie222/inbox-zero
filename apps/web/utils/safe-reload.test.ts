// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSafeToReload,
  registerOpenComposer,
  reloadAtNextSafeMoment,
  runPendingReloads,
} from "./safe-reload";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("safe reload", () => {
  it("blocks every open composer even without focus", () => {
    const closeFirst = registerOpenComposer();
    const closeSecond = registerOpenComposer();
    expect(isSafeToReload()).toBe(false);
    closeFirst();
    expect(isSafeToReload()).toBe(false);
    closeSecond();
    expect(isSafeToReload()).toBe(true);
  });

  it.each(["input", "textarea", "editable"])("blocks focused %s", (kind) => {
    const element = document.createElement(kind === "editable" ? "div" : kind);
    if (kind === "editable") {
      element.tabIndex = 0;
      Object.defineProperty(element, "isContentEditable", { value: true });
    }
    document.body.append(element);
    element.focus();
    expect(isSafeToReload()).toBe(false);
    element.blur();
    expect(isSafeToReload()).toBe(true);
  });

  it("waits for a safe route change or hidden window, and only runs once", () => {
    const reload = vi.fn();
    const cancel = reloadAtNextSafeMoment(reload);
    const close = registerOpenComposer();
    runPendingReloads();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    close();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    runPendingReloads();
    expect(reload).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("ignores the hidden state of a page that is unloading", () => {
    const reload = vi.fn();
    const cancel = reloadAtNextSafeMoment(reload);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    cancel();
  });

  it("resumes hidden reloads after a back-forward cache restore", () => {
    const reload = vi.fn();
    const cancel = reloadAtNextSafeMoment(reload);
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("runs on a safe route change and supports cancellation", () => {
    const reload = vi.fn();
    const cancel = reloadAtNextSafeMoment(reload);
    cancel();
    runPendingReloads();
    expect(reload).not.toHaveBeenCalled();
    reloadAtNextSafeMoment(reload);
    runPendingReloads();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
