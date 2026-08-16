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
  } catch {
    return true;
  }
  return true;
}
