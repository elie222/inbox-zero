import { describe, expect, it, vi } from "vitest";
import { bindMailEnginePageLifecycle } from "./page-lifecycle";

describe("mail page lifecycle", () => {
  it("aborts on pagehide and restarts after a back/forward cache restore", () => {
    const page = new EventTarget();
    const abort = new AbortController();
    const restore = vi.fn();
    bindMailEnginePageLifecycle(page, abort, restore);
    page.dispatchEvent(new Event("pagehide"));
    expect(abort.signal.aborted).toBe(true);
    page.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );
    expect(restore).toHaveBeenCalledOnce();
  });

  it("ignores initial pageshow and detaches after unmount", () => {
    const page = new EventTarget();
    const abort = new AbortController();
    const restore = vi.fn();
    const unbind = bindMailEnginePageLifecycle(page, abort, restore);
    page.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: false }),
    );
    expect(restore).not.toHaveBeenCalled();
    unbind();
    page.dispatchEvent(new Event("pagehide"));
    page.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );
    expect(abort.signal.aborted).toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });
});
