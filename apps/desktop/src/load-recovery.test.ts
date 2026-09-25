import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDesktopLoadRecovery } from "./load-recovery";

const origin = "https://app.example.com";
const mailUrl = `${origin}/account-1/mail`;

function setup() {
  const contents = Object.assign(new EventEmitter(), {
    loadURL: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    isDestroyed: () => false,
    isLoading: vi.fn(() => false),
    executeJavaScript: vi.fn().mockResolvedValue("text/html"),
    getURL: () => mailUrl,
  });
  const onBootFailure = vi.fn();
  const recovery = installDesktopLoadRecovery(
    contents as unknown as WebContents,
    { appOrigin: origin, getStartUrl: () => mailUrl, onBootFailure },
  );
  return { contents, recovery, onBootFailure };
}

function loadDocument(contents: EventEmitter, url = mailUrl) {
  contents.emit("did-start-navigation", {
    url,
    isSameDocument: false,
    isMainFrame: true,
  });
  contents.emit("did-navigate", {}, url, 200, "OK");
  contents.emit("did-finish-load");
}

function isRecoveryPage(url: unknown) {
  return typeof url === "string" && url.startsWith("data:text/html");
}

describe("desktop load recovery", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows recovery for a failed main page and automatically retries", async () => {
    const { contents } = setup();
    contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);
  });

  it("keeps retrying when Chromium finishes its error document after a failed load", async () => {
    const { contents } = setup();
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
    const { contents } = setup();
    contents.emit("did-start-navigation", {
      url: mailUrl,
      isSameDocument: false,
      isMainFrame: true,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(contents.stop).toHaveBeenCalledOnce();
    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
  });

  it("does not interrupt a loaded inbox for failed images or aborted navigations", async () => {
    const { contents, recovery } = setup();
    loadDocument(contents);
    recovery.markReady();
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

  it("recovers when the document loads but its scripts never boot the app", async () => {
    const { contents, recovery, onBootFailure } = setup();
    loadDocument(contents);
    recovery.recordRequestError({
      resourceType: "script",
      url: `${origin}/_next/static/chunks/main.js?dpl=abc`,
      error: "net::ERR_NETWORK_CHANGED",
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(contents.stop).toHaveBeenCalled();
    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
    expect(onBootFailure).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        reason: "timeout",
        documentFinished: true,
        failedRequests: { script: 1 },
        netErrors: ["net::ERR_NETWORK_CHANGED"],
        failedPaths: ["/_next/static/chunks/main.js"],
      }),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);
  });

  it("keeps a booted app and ignores later request failures", async () => {
    const { contents, recovery, onBootFailure } = setup();
    loadDocument(contents);
    recovery.markReady();
    recovery.recordRequestError({
      resourceType: "stylesheet",
      url: `${origin}/_next/static/css/route.css`,
      error: "net::ERR_INTERNET_DISCONNECTED",
    });
    contents.emit("did-start-navigation", {
      url: `${origin}/account-1/mail?type=archive`,
      isSameDocument: true,
      isMainFrame: true,
    });
    recovery.retryIfNotBooted();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
    expect(onBootFailure).not.toHaveBeenCalled();
  });

  it("treats an app that booted without its stylesheets as a failed load", () => {
    const { contents, recovery, onBootFailure } = setup();
    loadDocument(contents);
    recovery.recordRequestError({
      resourceType: "stylesheet",
      url: `${origin}/_next/static/css/app.css?dpl=abc`,
      error: "net::ERR_NETWORK_CHANGED",
    });
    recovery.markReady();

    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
    expect(onBootFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "stylesheet-failed",
        failedPaths: ["/_next/static/css/app.css"],
      }),
    );
  });

  it("leaves non-app documents on the app origin alone", async () => {
    const { contents, recovery } = setup();
    contents.executeJavaScript.mockResolvedValue("application/json");
    loadDocument(contents, `${origin}/openapi.json`);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    recovery.retryIfNotBooted();
    expect(contents.stop).not.toHaveBeenCalled();
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("gives a slow but still loading app more time before recovering", async () => {
    const { contents } = setup();
    contents.isLoading.mockReturnValue(true);
    loadDocument(contents);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
  });

  it("lets a committed document keep streaming past the navigation timeout", async () => {
    const { contents, recovery } = setup();
    contents.isLoading.mockReturnValue(true);
    contents.emit("did-start-navigation", {
      url: mailUrl,
      isSameDocument: false,
      isMainFrame: true,
    });
    contents.emit("did-navigate", {}, mailUrl, 200, "OK");
    await vi.advanceTimersByTimeAsync(20_000);
    recovery.markReady();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(contents.stop).not.toHaveBeenCalled();
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("backs off repeated retries and resets once the app boots", async () => {
    const { contents, recovery } = setup();
    const failLoad = () =>
      contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);

    failLoad();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);

    failLoad();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);

    loadDocument(contents);
    recovery.markReady();
    failLoad();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(mailUrl);
  });

  it("stops recovery after the app boots", async () => {
    const { contents, recovery } = setup();
    contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    loadDocument(contents);
    recovery.markReady();
    contents.loadURL.mockClear();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("retries right away after the system resumes if the app has not booted", async () => {
    const { contents, recovery } = setup();
    for (let failure = 0; failure < 4; failure++) {
      contents.emit("did-fail-load", {}, -106, "Disconnected", mailUrl, true);
    }
    contents.loadURL.mockClear();

    recovery.retryIfNotBooted();
    await vi.advanceTimersByTimeAsync(0);
    expect(contents.loadURL).toHaveBeenCalledExactlyOnceWith(mailUrl);
  });

  it("retries immediately when the recovery page is reloaded", async () => {
    const { contents } = setup();
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
    const { contents } = setup();
    contents.emit("render-process-gone", {}, { reason: "crashed" });
    expect(isRecoveryPage(contents.loadURL.mock.lastCall?.[0])).toBe(true);
    contents.emit("destroyed");
    contents.loadURL.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("recovers the current mailbox after client-side navigation", async () => {
    const { contents, recovery } = setup();
    loadDocument(contents);
    recovery.markReady();
    const currentUrl = `${origin}/account-2/mail?type=archive`;
    contents.emit("did-start-navigation", {
      url: currentUrl,
      isSameDocument: true,
      isMainFrame: true,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contents.loadURL).not.toHaveBeenCalled();
    contents.emit("render-process-gone", {}, { reason: "crashed" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contents.loadURL).toHaveBeenLastCalledWith(currentUrl);
  });
});
