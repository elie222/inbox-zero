import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDesktopLoadRecovery } from "./load-recovery";

const origin = "https://app.example.com";
const mailUrl = `${origin}/account-1/mail`;

function makeContents() {
  return Object.assign(new EventEmitter(), {
    loadURL: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    isDestroyed: () => false,
    getURL: () => mailUrl,
  });
}

describe("desktop load recovery", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows recovery for a failed main page and automatically retries", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    expect(contents.loadURL).toHaveBeenCalledWith(
      expect.stringContaining("data:text/html"),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);
  });

  it("keeps retrying when Chromium finishes its error document after a failed load", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit("did-start-navigation", {
      url: mailUrl,
      isSameDocument: false,
      isMainFrame: true,
    });
    contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    contents.emit("did-finish-load");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);
  });

  it("replaces a stalled navigation with recovery instead of waiting minutes", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit("did-start-navigation", {
      url: mailUrl,
      isSameDocument: false,
      isMainFrame: true,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(contents.stop).toHaveBeenCalledOnce();
    expect(contents.loadURL).toHaveBeenCalledWith(
      expect.stringContaining("data:text/html"),
    );
  });

  it("does not interrupt a loaded inbox for failed images or aborted navigations", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit(
      "did-fail-load",
      {},
      -106,
      "Disconnected",
      `${origin}/image.png`,
      false,
    );
    contents.emit("did-fail-load", {}, -3, "Aborted", mailUrl, true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("stops recovery after the app finishes loading", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    contents.emit("did-start-navigation", {
      url: mailUrl,
      isSameDocument: false,
      isMainFrame: true,
    });
    contents.emit("did-finish-load");
    contents.loadURL.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("retries immediately when the recovery page is reloaded", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    const recoveryUrl = contents.loadURL.mock.calls[0][0];
    const navigation = {
      url: recoveryUrl,
      isMainFrame: true,
      isSameDocument: false,
    };
    contents.emit("did-start-navigation", navigation);
    contents.loadURL.mockClear();
    contents.emit("did-start-navigation", navigation);
    await vi.advanceTimersByTimeAsync(0);
    expect(contents.loadURL).toHaveBeenCalledExactlyOnceWith(mailUrl);
  });

  it("recovers a crashed renderer and cancels timers when the window closes", async () => {
    const contents = makeContents();
    installDesktopLoadRecovery(
      contents as unknown as WebContents,
      origin,
      () => mailUrl,
    );
    contents.emit("render-process-gone", {}, { reason: "crashed" });
    expect(contents.loadURL).toHaveBeenCalledWith(
      expect.stringContaining("data:text/html"),
    );
    contents.emit("destroyed");
    contents.loadURL.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
  });
});
