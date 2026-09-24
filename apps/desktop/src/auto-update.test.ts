import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForDesktopUpdatesManually,
  DESKTOP_UPDATE_INTERVAL_MS,
  installDownloadedDesktopUpdate,
  resetDesktopAutoUpdateForTests,
  startDesktopAutoUpdate,
} from "./auto-update";

const {
  autoUpdater,
  app,
  dialog,
  notificationOptions,
  notificationShow,
  Notification,
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
  };
});

vi.mock("electron", () => ({ app, dialog, Notification }));
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
      checkForDesktopUpdatesManually(beforeInstall, false),
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

    await expect(checkForDesktopUpdatesManually(vi.fn(), true)).resolves.toBe(
      true,
    );

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

    await expect(checkForDesktopUpdatesManually(vi.fn(), true)).resolves.toBe(
      true,
    );

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
    await checkForDesktopUpdatesManually(vi.fn(), true);
    reportProgress?.({ percent: 41.2 });
    reportProgress?.({ percent: 41.4 });

    expect(onDownloadProgress).toHaveBeenCalledTimes(1);
    expect(onDownloadProgress).toHaveBeenCalledWith(41);
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
    await checkForDesktopUpdatesManually(vi.fn(), true);
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
      checkForDesktopUpdatesManually(beforeInstall, true),
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

    await expect(checkForDesktopUpdatesManually(vi.fn(), true)).resolves.toBe(
      false,
    );

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
