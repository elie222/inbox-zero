import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForDesktopUpdatesManually,
  DESKTOP_IDLE_INSTALL_CHECK_MS,
  DESKTOP_UPDATE_INTERVAL_MS,
  installDownloadedDesktopUpdate,
  resetDesktopAutoUpdateForTests,
  startDesktopAutoUpdate,
} from "./auto-update";
import { captureDesktopError } from "./sentry";

const {
  autoUpdater,
  app,
  dialog,
  notificationOptions,
  notificationShow,
  Notification,
  powerMonitor,
} = vi.hoisted(() => {
  const notificationShow = vi.fn();
  const notificationOptions: Array<{ title: string; body: string }> = [];
  class Notification {
    static isSupported() {
      return true;
    }
    constructor(options: { title: string; body: string }) {
      notificationOptions.push(options);
    }
    show() {
      notificationShow();
    }
  }
  return {
    app: { getVersion: vi.fn(() => "0.1.0"), isPackaged: true },
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      quitAndInstall: vi.fn(),
      setFeedURL: vi.fn(),
    },
    dialog: { showMessageBox: vi.fn() },
    notificationOptions,
    notificationShow,
    Notification,
    powerMonitor: { getSystemIdleState: vi.fn(() => "active") },
  };
});

vi.mock("electron", () => ({ app, dialog, Notification, powerMonitor }));
vi.mock("electron-updater", () => ({ autoUpdater }));
vi.mock("./sentry", () => ({ captureDesktopError: vi.fn() }));

describe("startDesktopAutoUpdate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetDesktopAutoUpdateForTests();
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.downloadUpdate.mockReset();
    autoUpdater.on.mockReset();
    autoUpdater.once.mockReset();
    autoUpdater.quitAndInstall.mockReset();
    autoUpdater.setFeedURL.mockReset();
    dialog.showMessageBox.mockReset();
    notificationShow.mockReset();
    notificationOptions.length = 0;
    dialog.showMessageBox.mockResolvedValue({
      checkboxChecked: false,
      response: 1,
    });
    app.isPackaged = true;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("skips the update check in development", async () => {
    await expect(startDesktopAutoUpdate(false)).resolves.toBe(false);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("records updater failures instead of reporting success", async () => {
    autoUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error("feed unavailable"),
    );

    await expect(startDesktopAutoUpdate(true)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("feed unavailable");
    expect(captureDesktopError).toHaveBeenCalled();
  });

  it("does not report a check that failed because the network dropped", async () => {
    vi.mocked(captureDesktopError).mockClear();
    autoUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error("net::ERR_NETWORK_CHANGED"),
    );

    await expect(startDesktopAutoUpdate(true)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("net::ERR_NETWORK_CHANGED");
    expect(captureDesktopError).not.toHaveBeenCalled();
  });

  it("records feed setup failures from setFeedURL", async () => {
    autoUpdater.setFeedURL.mockImplementationOnce(() => {
      throw new Error("invalid feed URL");
    });

    await expect(startDesktopAutoUpdate(true)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("invalid feed URL");
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("keeps checking for updates while the app remains open", async () => {
    vi.useFakeTimers();
    autoUpdater.checkForUpdates.mockResolvedValue(null);

    try {
      await expect(startDesktopAutoUpdate(true)).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(DESKTOP_UPDATE_INTERVAL_MS);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies once when a background download is ready to restart", async () => {
    const onUpdateReady = vi.fn();
    autoUpdater.checkForUpdates.mockResolvedValue(null);
    let notifyDownloaded: ((info: { version: string }) => void) | undefined;
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "update-downloaded") notifyDownloaded = listener;
    });

    await startDesktopAutoUpdate(true, { onUpdateReady });
    notifyDownloaded?.({ version: "0.2.0" });
    notifyDownloaded?.({ version: "0.2.0" });

    expect(onUpdateReady).toHaveBeenCalledOnce();
    expect(onUpdateReady).toHaveBeenCalledWith("0.2.0");
    expect(notificationOptions).toEqual([
      {
        body: "Restart Inbox Zero to finish updating to 0.2.0.",
        title: "Update ready to install",
      },
    ]);
    expect(notificationShow).toHaveBeenCalledOnce();
  });

  it("hides background download progress", async () => {
    const onDownloadProgress = vi.fn();
    let reportProgress: ((progress: { percent: number }) => void) | undefined;
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "download-progress") reportProgress = listener;
    });
    autoUpdater.checkForUpdates.mockResolvedValue(null);

    await startDesktopAutoUpdate(true, { onDownloadProgress });
    reportProgress?.({ percent: 40 });

    expect(onDownloadProgress).not.toHaveBeenCalled();
  });
});

describe("checkForDesktopUpdatesManually", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetDesktopAutoUpdateForTests();
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.downloadUpdate.mockReset();
    autoUpdater.on.mockReset();
    autoUpdater.once.mockReset();
    autoUpdater.quitAndInstall.mockReset();
    autoUpdater.setFeedURL.mockReset();
    dialog.showMessageBox.mockReset();
    dialog.showMessageBox.mockResolvedValue({
      checkboxChecked: false,
      response: 1,
    });
    app.getVersion.mockReturnValue("0.1.0");
    app.isPackaged = true;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("explains that development builds cannot check for updates", async () => {
    const beforeInstall = vi.fn();

    await expect(
      checkForDesktopUpdatesManually(beforeInstall, { isPackaged: false }),
    ).resolves.toBe(false);

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Updates are unavailable in development builds",
      }),
    );
  });

  it("confirms when the installed app is current", async () => {
    autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "0.1.0" },
    });

    await expect(
      checkForDesktopUpdatesManually(vi.fn(), { isPackaged: true }),
    ).resolves.toBe(true);

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "Inbox Zero 0.1.0 is the latest version.",
        message: "You're up to date",
      }),
    );
  });

  it("keeps the app usable while an update downloads", async () => {
    autoUpdater.checkForUpdates.mockResolvedValue({
      downloadPromise: new Promise(() => {}),
      isUpdateAvailable: true,
      updateInfo: { version: "0.2.0" },
    });

    await expect(
      checkForDesktopUpdatesManually(vi.fn(), { isPackaged: true }),
    ).resolves.toBe(true);

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        detail:
          "You can keep using Inbox Zero. Restart to Update will appear in the app menu when it's ready.",
        message: "Downloading Inbox Zero 0.2.0",
      }),
    );
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("reports progress only after someone checks for updates", async () => {
    const onDownloadProgress = vi.fn();
    let reportProgress: ((progress: { percent: number }) => void) | undefined;
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "download-progress") reportProgress = listener;
    });
    autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "0.2.0" },
    });

    await startDesktopAutoUpdate(true, { onDownloadProgress });
    await checkForDesktopUpdatesManually(vi.fn(), { isPackaged: true });
    reportProgress?.({ percent: 41.2 });
    reportProgress?.({ percent: 41.4 });

    expect(onDownloadProgress.mock.calls).toEqual([
      [{ percent: 0, version: "0.2.0" }],
      [{ percent: 41, version: "0.2.0" }],
    ]);
  });

  it("shows download progress in the app instead of a dialog when it can", async () => {
    const onDownloadProgress = vi.fn();
    autoUpdater.checkForUpdates.mockResolvedValue({
      downloadPromise: new Promise(() => {}),
      isUpdateAvailable: true,
      updateInfo: { version: "0.2.0" },
    });

    await startDesktopAutoUpdate(true, { onDownloadProgress });
    await checkForDesktopUpdatesManually(vi.fn(), {
      isPackaged: true,
      showsProgressInApp: () => true,
    });

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(onDownloadProgress).toHaveBeenLastCalledWith({
      percent: 0,
      version: "0.2.0",
    });
  });

  it("reports a watched download as ready before clearing its progress", async () => {
    const events: unknown[] = [];
    let notifyDownloaded: ((info: { version: string }) => void) | undefined;
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "update-downloaded") notifyDownloaded = listener;
    });
    autoUpdater.checkForUpdates.mockResolvedValue({
      downloadPromise: new Promise(() => {}),
      isUpdateAvailable: true,
      updateInfo: { version: "0.2.0" },
    });

    await startDesktopAutoUpdate(true, {
      onDownloadProgress: (progress) => events.push(progress),
      onUpdateReady: (version) => events.push(`ready ${version}`),
    });
    await checkForDesktopUpdatesManually(vi.fn(), {
      isPackaged: true,
      showsProgressInApp: () => true,
    });
    notifyDownloaded?.({ version: "0.2.0" });

    expect(events).toEqual([
      { percent: 0, version: "0.2.0" },
      "ready 0.2.0",
      null,
    ]);
  });

  it("clears progress when a background download fails", async () => {
    const onDownloadProgress = vi.fn();
    let rejectDownload: (error: Error) => void = () => {};
    const downloadPromise = new Promise<string[]>((_, reject) => {
      rejectDownload = reject;
    });
    autoUpdater.checkForUpdates.mockResolvedValue({
      downloadPromise,
      isUpdateAvailable: true,
      updateInfo: { version: "0.2.0" },
    });

    await startDesktopAutoUpdate(true, { onDownloadProgress });
    await checkForDesktopUpdatesManually(vi.fn(), { isPackaged: true });
    rejectDownload(new Error("download failed"));
    await downloadPromise.catch(() => undefined);

    expect(console.error).toHaveBeenCalledWith("download failed");
    expect(onDownloadProgress).toHaveBeenCalledWith(null);
  });

  it("restarts immediately when the update is already downloaded", async () => {
    const beforeInstall = vi.fn();
    let notifyDownloaded: ((info: { version: string }) => void) | undefined;
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "update-downloaded") notifyDownloaded = listener;
    });
    autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "0.1.0" },
    });
    dialog.showMessageBox.mockResolvedValue({
      checkboxChecked: false,
      response: 0,
    });

    await startDesktopAutoUpdate(true);
    notifyDownloaded?.({ version: "0.2.0" });

    await expect(
      checkForDesktopUpdatesManually(beforeInstall, { isPackaged: true }),
    ).resolves.toBe(true);

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: ["Restart to Update", "Later"],
        message: "An update is ready to install",
      }),
    );
    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(beforeInstall.mock.invocationCallOrder[0]).toBeLessThan(
      autoUpdater.quitAndInstall.mock.invocationCallOrder[0],
    );
  });

  it("shows a useful error when the manual check fails", async () => {
    autoUpdater.checkForUpdates.mockRejectedValue(
      new Error("feed unavailable"),
    );

    await expect(
      checkForDesktopUpdatesManually(vi.fn(), { isPackaged: true }),
    ).resolves.toBe(false);

    expect(console.error).toHaveBeenCalledWith("feed unavailable");
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Couldn't check for updates",
        type: "error",
      }),
    );
  });
});

describe("installDownloadedDesktopUpdate", () => {
  beforeEach(() => {
    resetDesktopAutoUpdateForTests();
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.on.mockReset();
    autoUpdater.quitAndInstall.mockReset();
    autoUpdater.setFeedURL.mockReset();
  });

  it("applies a downloaded update without another prompt", async () => {
    const beforeInstall = vi.fn();
    let notifyDownloaded: ((info: { version: string }) => void) | undefined;
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "update-downloaded") notifyDownloaded = listener;
    });
    autoUpdater.checkForUpdates.mockResolvedValue(null);

    await startDesktopAutoUpdate(true);
    notifyDownloaded?.({ version: "0.2.0" });

    await expect(installDownloadedDesktopUpdate(beforeInstall)).resolves.toBe(
      true,
    );

    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("does nothing when no update has been downloaded", async () => {
    await expect(installDownloadedDesktopUpdate(vi.fn())).resolves.toBe(false);
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe("installing a downloaded update while idle", () => {
  let notifyDownloaded: ((info: { version: string }) => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    resetDesktopAutoUpdateForTests();
    notifyDownloaded = undefined;
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.checkForUpdates.mockResolvedValue(null);
    autoUpdater.on.mockReset();
    autoUpdater.on.mockImplementation((event, listener) => {
      if (event === "update-downloaded") notifyDownloaded = listener;
    });
    autoUpdater.quitAndInstall.mockReset();
    autoUpdater.setFeedURL.mockReset();
    powerMonitor.getSystemIdleState.mockReset();
  });

  afterEach(() => {
    resetDesktopAutoUpdateForTests();
    vi.useRealTimers();
  });

  it("restarts into the update once nobody is using the computer", async () => {
    const prepareToQuit = vi.fn();
    powerMonitor.getSystemIdleState.mockReturnValue("idle");

    await startDesktopAutoUpdate(true, { prepareToQuit });
    notifyDownloaded?.({ version: "0.2.0" });
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS);

    expect(prepareToQuit).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(prepareToQuit.mock.invocationCallOrder[0]).toBeLessThan(
      autoUpdater.quitAndInstall.mock.invocationCallOrder[0],
    );
  });

  it("treats a locked screen as idle", async () => {
    powerMonitor.getSystemIdleState.mockReturnValue("locked");

    await startDesktopAutoUpdate(true, { prepareToQuit: vi.fn() });
    notifyDownloaded?.({ version: "0.2.0" });
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS);

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("waits while the user is active and installs when they step away", async () => {
    const prepareToQuit = vi.fn();
    powerMonitor.getSystemIdleState.mockReturnValue("active");

    await startDesktopAutoUpdate(true, { prepareToQuit });
    notifyDownloaded?.({ version: "0.2.0" });
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS * 30);

    expect(prepareToQuit).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    powerMonitor.getSystemIdleState.mockReturnValue("idle");
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS);

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("keeps waiting when the system cannot report whether it is idle", async () => {
    powerMonitor.getSystemIdleState.mockReturnValue("unknown");

    await startDesktopAutoUpdate(true, { prepareToQuit: vi.fn() });
    notifyDownloaded?.({ version: "0.2.0" });
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS * 30);

    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("tries again at the next idle check when installing fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    powerMonitor.getSystemIdleState.mockReturnValue("idle");
    autoUpdater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error("installer busy");
    });

    try {
      await startDesktopAutoUpdate(true, { prepareToQuit: vi.fn() });
      notifyDownloaded?.({ version: "0.2.0" });
      await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS * 2);

      expect(console.error).toHaveBeenCalledWith("installer busy");
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("tries again when the updater reports a failed install without throwing", async () => {
    powerMonitor.getSystemIdleState.mockReturnValue("idle");

    await startDesktopAutoUpdate(true, { prepareToQuit: vi.fn() });
    notifyDownloaded?.({ version: "0.2.0" });
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS * 2);

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it("does not restart before an update has downloaded", async () => {
    powerMonitor.getSystemIdleState.mockReturnValue("idle");

    await startDesktopAutoUpdate(true, { prepareToQuit: vi.fn() });
    await vi.advanceTimersByTimeAsync(DESKTOP_IDLE_INSTALL_CHECK_MS * 30);

    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
