import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDesktopAutoUpdate } from "./auto-update";

const { autoUpdater, app } = vi.hoisted(() => ({
  app: { isPackaged: true },
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdatesAndNotify: vi.fn(),
    setFeedURL: vi.fn(),
  },
}));

vi.mock("electron", () => ({ app }));
vi.mock("electron-updater", () => ({ autoUpdater }));

describe("startDesktopAutoUpdate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    autoUpdater.checkForUpdatesAndNotify.mockReset();
    autoUpdater.setFeedURL.mockReset();
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
});
