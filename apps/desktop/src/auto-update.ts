import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { getDesktopUpdateFeedUrl } from "./update-feed";

export function logDesktopUpdateError(error: unknown) {
  autoUpdater.logger?.error(
    error instanceof Error ? error.message : "Desktop update check failed",
  );
}

export async function startDesktopAutoUpdate(
  isPackaged = app.isPackaged,
): Promise<boolean> {
  if (!isPackaged) return false;

  try {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: getDesktopUpdateFeedUrl(),
    });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    await autoUpdater.checkForUpdatesAndNotify();
    return true;
  } catch (error) {
    logDesktopUpdateError(error);
    return false;
  }
}
