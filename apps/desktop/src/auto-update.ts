import { app, dialog } from "electron";
import type { AppUpdater } from "electron-updater";
import { getDesktopUpdateFeedUrl } from "./update-feed";

export const DESKTOP_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function logDesktopUpdateError(error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Desktop update check failed",
  );
}

export async function startDesktopAutoUpdate(
  isPackaged = app.isPackaged,
): Promise<boolean> {
  if (!isPackaged) return false;

  try {
    const autoUpdater = await getDesktopAutoUpdater();
    scheduleDesktopUpdateChecks(autoUpdater);
    await autoUpdater.checkForUpdatesAndNotify();
    return true;
  } catch (error) {
    logDesktopUpdateError(error);
    return false;
  }
}

export async function checkForDesktopUpdatesManually(
  prepareToQuit: () => void,
  isPackaged = app.isPackaged,
): Promise<boolean> {
  if (!isPackaged) {
    await dialog.showMessageBox({
      type: "info",
      message: "Updates are unavailable in development builds",
      detail: "Install a released version of Inbox Zero to receive updates.",
    });
    return false;
  }

  try {
    const autoUpdater = await getDesktopAutoUpdater();
    const result = await autoUpdater.checkForUpdates();
    if (!result) throw new Error("Desktop updater is unavailable");

    if (!result.isUpdateAvailable) {
      await dialog.showMessageBox({
        type: "info",
        message: "You're up to date",
        detail: `Inbox Zero ${app.getVersion()} is the latest version.`,
      });
      return true;
    }

    await dialog.showMessageBox({
      type: "info",
      message: `Downloading Inbox Zero ${result.updateInfo.version}`,
      detail:
        "You can keep using Inbox Zero. We'll let you know when the update is ready.",
    });
    await (result.downloadPromise ?? autoUpdater.downloadUpdate());

    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart to Update", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: "An update is ready to install",
      detail: `Inbox Zero ${result.updateInfo.version} has been downloaded. Restart now to finish updating.`,
    });
    if (response === 0) {
      prepareToQuit();
      autoUpdater.quitAndInstall();
    }
    return true;
  } catch (error) {
    logDesktopUpdateError(error);
    await dialog.showMessageBox({
      type: "error",
      message: "Couldn't check for updates",
      detail: "Please try again later.",
    });
    return false;
  }
}

async function getDesktopAutoUpdater(): Promise<AppUpdater> {
  const { autoUpdater } = await import("electron-updater");
  autoUpdater.setFeedURL({
    provider: "generic",
    url: getDesktopUpdateFeedUrl(),
  });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  return autoUpdater;
}

function scheduleDesktopUpdateChecks(autoUpdater: AppUpdater) {
  const timer = setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(logDesktopUpdateError);
  }, DESKTOP_UPDATE_INTERVAL_MS);
  autoUpdater.once("update-downloaded", () => clearInterval(timer));
  timer.unref();
}
