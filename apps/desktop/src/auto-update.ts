import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { getDesktopUpdateFeedUrl } from "./update-feed";

export async function startDesktopAutoUpdate(
  isPackaged = app.isPackaged,
): Promise<boolean> {
  if (!isPackaged) return false;

  autoUpdater.setFeedURL({
    provider: "generic",
    url: getDesktopUpdateFeedUrl(),
  });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  try {
    await autoUpdater.checkForUpdatesAndNotify();
    return true;
  } catch (error) {
    autoUpdater.logger?.error(
      error instanceof Error ? error.message : "Desktop update check failed",
    );
    return false;
  }
}
