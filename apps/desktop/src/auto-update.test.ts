import { beforeEach, describe, expect, it, vi } from "vitest";
import { startDesktopAutoUpdate } from "./auto-update";

const { autoUpdater, app } = vi.hoisted(() => ({
  app: { isPackaged: true },
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdatesAndNotify: vi.fn(),
    logger: { error: vi.fn() },
    setFeedURL: vi.fn(),
  },
}));

vi.mock("electron", () => ({ app }));
vi.mock("electron-updater", () => ({ autoUpdater }));

describe("startDesktopAutoUpdate", () => {
  beforeEach(() => {
    autoUpdater.checkForUpdatesAndNotify.mockReset();
    autoUpdater.logger.error.mockReset();
    autoUpdater.setFeedURL.mockReset();
    app.isPackaged = true;
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
    expect(autoUpdater.logger.error).toHaveBeenCalledWith("feed unavailable");
  });
});
