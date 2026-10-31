import { app, dialog, Notification } from "electron";
import type { AppUpdater, UpdateInfo } from "electron-updater";
import { captureDesktopError } from "./sentry";
import { isTransientNetworkError } from "./network-errors";
import { getDesktopUpdateFeedUrl } from "./update-feed";

export const DESKTOP_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let downloadedVersion: string | null = null;
let updateEventsBound = false;
let reportDownloadProgress = false;
let downloadingVersion: string | null = null;
let lastReportedPercent: number | null = null;
let onUpdateReady: ((version: string) => void) | undefined;
let onDownloadProgress:
  | ((progress: DesktopDownloadProgress | null) => void)
  | undefined;

export type DesktopDownloadProgress = { version: string; percent: number };

export function logDesktopUpdateError(error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Desktop update check failed",
  );
  if (!isTransientNetworkError(error)) {
    captureDesktopError(error, { area: "auto-update" });
  }
}

export function resetDesktopAutoUpdateForTests() {
  downloadedVersion = null;
  updateEventsBound = false;
  reportDownloadProgress = false;
  downloadingVersion = null;
  lastReportedPercent = null;
  onUpdateReady = undefined;
  onDownloadProgress = undefined;
}

export function isDesktopUpdateReady() {
  return downloadedVersion !== null;
}

export async function startDesktopAutoUpdate(
  isPackaged = app.isPackaged,
  handlers?: {
    onUpdateReady?: (version: string) => void;
    onDownloadProgress?: (progress: DesktopDownloadProgress | null) => void;
  },
): Promise<boolean> {
  if (!isPackaged) return false;

  try {
    const autoUpdater = await getDesktopAutoUpdater(handlers);
    scheduleDesktopUpdateChecks(autoUpdater);
    observeDownload(await autoUpdater.checkForUpdates());
    return true;
  } catch (error) {
    logDesktopUpdateError(error);
    return false;
  }
}

export async function installDownloadedDesktopUpdate(
  prepareToQuit: () => void,
): Promise<boolean> {
  if (!downloadedVersion) return false;

  const autoUpdater = await getDesktopAutoUpdater();
  prepareToQuit();
  autoUpdater.quitAndInstall(true, true);
  return true;
}

export async function checkForDesktopUpdatesManually(
  prepareToQuit: () => void,
  {
    isPackaged = app.isPackaged,
    showsProgressInApp = () => false,
  }: { isPackaged?: boolean; showsProgressInApp?: () => boolean } = {},
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
    if (downloadedVersion) {
      return promptToInstallDownloadedUpdate(prepareToQuit, autoUpdater);
    }

    reportDownloadProgress = true;
    const result = await autoUpdater.checkForUpdates();
    if (!result) throw new Error("Desktop updater is unavailable");
    observeDownload(result, stopReportingDownloadProgress);

    if (downloadedVersion) {
      stopReportingDownloadProgress();
      return promptToInstallDownloadedUpdate(prepareToQuit, autoUpdater);
    }

    if (!result.isUpdateAvailable) {
      stopReportingDownloadProgress();
      await dialog.showMessageBox({
        type: "info",
        message: "You're up to date",
        detail: `Inbox Zero ${app.getVersion()} is the latest version.`,
      });
      return true;
    }

    downloadingVersion = result.updateInfo.version;
    lastReportedPercent ??= 0;
    onDownloadProgress?.({
      version: downloadingVersion,
      percent: lastReportedPercent,
    });
    if (showsProgressInApp()) return true;

    await dialog.showMessageBox({
      type: "info",
      message: `Downloading Inbox Zero ${result.updateInfo.version}`,
      detail:
        "You can keep using Inbox Zero. Restart to Update will appear in the app menu when it's ready.",
    });
    return true;
  } catch (error) {
    stopReportingDownloadProgress();
    logDesktopUpdateError(error);
    await dialog.showMessageBox({
      type: "error",
      message: "Couldn't check for updates",
      detail: "Please try again later.",
    });
    return false;
  }
}

async function getDesktopAutoUpdater(handlers?: {
  onUpdateReady?: (version: string) => void;
  onDownloadProgress?: (progress: DesktopDownloadProgress | null) => void;
}): Promise<AppUpdater> {
  if (handlers?.onUpdateReady) onUpdateReady = handlers.onUpdateReady;
  if (handlers?.onDownloadProgress) {
    onDownloadProgress = handlers.onDownloadProgress;
  }

  const { autoUpdater } = await import("electron-updater");
  autoUpdater.setFeedURL({
    provider: "generic",
    url: getDesktopUpdateFeedUrl(),
  });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  bindUpdateDownloaded(autoUpdater);
  return autoUpdater;
}

function bindUpdateDownloaded(autoUpdater: AppUpdater) {
  if (updateEventsBound) return;
  updateEventsBound = true;
  autoUpdater.on("download-progress", (progress: { percent: number }) => {
    if (!reportDownloadProgress) return;
    reportProgress(Math.round(progress.percent));
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    if (downloadedVersion === info.version) return;
    downloadedVersion = info.version;
    notifyUpdateReady(info.version);
    onUpdateReady?.(info.version);
    stopReportingDownloadProgress();
  });
}

// Events that arrive before the check resolves have no version yet; the check
// reports the latest percent once it knows which version is downloading.
function reportProgress(percent: number) {
  if (percent === lastReportedPercent) return;
  lastReportedPercent = percent;
  if (!downloadingVersion) return;
  onDownloadProgress?.({ version: downloadingVersion, percent });
}

function stopReportingDownloadProgress() {
  if (!reportDownloadProgress && lastReportedPercent === null) return;
  reportDownloadProgress = false;
  downloadingVersion = null;
  lastReportedPercent = null;
  onDownloadProgress?.(null);
}

function notifyUpdateReady(version: string) {
  try {
    if (!Notification.isSupported()) return;
    new Notification({
      title: "Update ready to install",
      body: `Restart Inbox Zero to finish updating to ${version}.`,
    }).show();
  } catch (error) {
    logDesktopUpdateError(error);
  }
}

async function promptToInstallDownloadedUpdate(
  prepareToQuit: () => void,
  autoUpdater: AppUpdater,
) {
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Restart to Update", "Later"],
    defaultId: 0,
    cancelId: 1,
    message: "An update is ready to install",
    detail: `Inbox Zero ${downloadedVersion} has been downloaded. Restart now to finish updating.`,
  });
  if (response === 0) {
    prepareToQuit();
    autoUpdater.quitAndInstall(true, true);
  }
  return true;
}

function scheduleDesktopUpdateChecks(autoUpdater: AppUpdater) {
  const timer = setInterval(() => {
    autoUpdater
      .checkForUpdates()
      .then((result) => observeDownload(result))
      .catch(logDesktopUpdateError);
  }, DESKTOP_UPDATE_INTERVAL_MS);
  timer.unref();
}

function observeDownload(
  result: { downloadPromise?: Promise<unknown> | null } | null | undefined,
  onFailure?: () => void,
) {
  result?.downloadPromise?.catch((error: unknown) => {
    onFailure?.();
    logDesktopUpdateError(error);
  });
}
