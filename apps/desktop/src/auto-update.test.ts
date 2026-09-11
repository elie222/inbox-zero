import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForDesktopUpdatesManually,
  DESKTOP_UPDATE_INTERVAL_MS,
  startDesktopAutoUpdate,
} from "./auto-update";

const { autoUpdater, app, dialog } = vi.hoisted(() => ({
  app: { getVersion: vi.fn(() => "0.1.0"), isPackaged: true },
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
    downloadUpdate: vi.fn(),
    once: vi.fn(),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn(),
  },
  dialog: { showMessageBox: vi.fn() },
}));

vi.mock("electron", () => ({ app, dialog }));
vi.mock("electron-updater", () => ({ autoUpdater }));

describe("startDesktopAutoUpdate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.checkForUpdatesAndNotify.mockReset();
    autoUpdater.downloadUpdate.mockReset();
    autoUpdater.once.mockReset();
    autoUpdater.quitAndInstall.mockReset();
    autoUpdater.setFeedURL.mockReset();
    dialog.showMessageBox.mockReset();
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
    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it("records updater failures instead of reporting success", async () => {
    autoUpdater.checkForUpdatesAndNotify.mockRejectedValueOnce(
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
    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it("keeps checking for updates while the app remains open", async () => {
    vi.useFakeTimers();
    autoUpdater.checkForUpdatesAndNotify.mockResolvedValue(null);

    try {
      await expect(startDesktopAutoUpdate(true)).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(DESKTOP_UPDATE_INTERVAL_MS);

      expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops periodic checks after an update downloads", async () => {
    vi.useFakeTimers();
    autoUpdater.checkForUpdatesAndNotify.mockResolvedValue(null);
    let notifyDownloaded: (() => void) | undefined;
    autoUpdater.once.mockImplementation((event, listener) => {
      if (event === "update-downloaded") notifyDownloaded = listener;
    });

    try {
      await startDesktopAutoUpdate(true);
      notifyDownloaded?.();
      await vi.advanceTimersByTimeAsync(DESKTOP_UPDATE_INTERVAL_MS);

      expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("checkForDesktopUpdatesManually", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.downloadUpdate.mockReset();
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

  it("downloads an available update and restarts when requested", async () => {
    const beforeInstall = vi.fn();
    const downloadPromise = Promise.resolve(["update.zip"]);
    autoUpdater.checkForUpdates.mockResolvedValue({
      downloadPromise,
      isUpdateAvailable: true,
      updateInfo: { version: "0.2.0" },
    });
    dialog.showMessageBox
      .mockResolvedValueOnce({ checkboxChecked: false, response: 0 })
      .mockResolvedValueOnce({ checkboxChecked: false, response: 0 });

    await expect(
      checkForDesktopUpdatesManually(beforeInstall, true),
    ).resolves.toBe(true);

    expect(dialog.showMessageBox).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: "Downloading Inbox Zero 0.2.0" }),
    );
    expect(dialog.showMessageBox).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        buttons: ["Restart to Update", "Later"],
        message: "An update is ready to install",
      }),
    );
    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
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
