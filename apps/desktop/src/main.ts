import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BaseWindow,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  screen,
  session,
  shell,
  utilityProcess,
  WebContentsView,
  type Session,
  type WebContents,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import {
  type DesktopBootFailure,
  installDesktopLoadRecovery,
} from "./load-recovery";
import { configureDesktopApplicationMenu } from "./application-menu";
import { installDesktopContextMenu } from "./context-menu";
import { recordDesktopDiagnostics } from "./diagnostics";
import {
  checkForDesktopUpdatesManually,
  installDownloadedDesktopUpdate,
  type DesktopDownloadProgress,
  logDesktopUpdateError,
  startDesktopAutoUpdate,
} from "./auto-update";
import {
  DESKTOP_PROTOCOL,
  findDesktopProtocolUrl,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopHomeUrl,
  getDesktopLocalMailUrl,
  getDesktopMailAccountId,
  getDesktopPostAuthUrl,
  getDesktopSessionRestoreUrl,
  getDesktopWindowChrome,
  getDesktopWindowDragCss,
  isAllowedDesktopNavigation,
  isAllowedExternalUrl,
  isDesktopAuthProvider,
  isDesktopLocalMailUrl,
  normalizeDesktopCallbackPath,
  parseDesktopAuthCallback,
  resolveDesktopStartUrl,
  shouldSmokeLocalMail,
  shouldUseLocalMailRenderer,
} from "./desktop";
import { createMailNotifier } from "./mail-notifications";
import { captureDesktopError, initDesktopSentry } from "./sentry";
import { startEventLoopDelayMonitor } from "./health";
import { readDesktopAttachment } from "./mail-engine/attachment";
import { registerMailEnginePushIpc } from "./mail-engine/push-ipc";
import {
  createDesktopMailProcessOwner,
  type DesktopMailProcessOwner,
} from "./mail-engine/utility-host";
import {
  closeAndWipeDesktopMailbox,
  closeDesktopMailbox,
} from "./mail-engine/wipe";
import {
  DEFAULT_DESKTOP_WINDOW_HEIGHT,
  DEFAULT_DESKTOP_WINDOW_WIDTH,
  type DesktopWindowBounds,
  fitWindowBoundsToWorkArea,
  MAX_DESKTOP_WINDOWS,
  MIN_DESKTOP_WINDOW_HEIGHT,
  MIN_DESKTOP_WINDOW_WIDTH,
  parseDesktopWindowStates,
} from "./windows";

const PARTITION = "persist:inbox-zero";
const DESKTOP_AUTH_PROOF_TTL_MS = 5 * 60 * 1000;
const PENDING_CALLBACK_PATH_FILE = "pending-auth-callback-path";
const LAST_APP_URL_FILE = "last-app-url";
const WINDOWS_STATE_FILE = "windows.json";

// A tab owns one page. Every window currently holds exactly one tab.
type AppTab = {
  view: WebContentsView;
  contents: WebContents;
  // Last URL worth restoring on the next launch; unset on the login page.
  restoreUrl?: string;
};
type AppWindow = { window: BaseWindow; tabs: AppTab[]; activeTab: AppTab };

const appWindows: AppWindow[] = [];
const unreadByContents = new Map<number, number>();
const loadRecoveryByContents = new Map<
  number,
  ReturnType<typeof installDesktopLoadRecovery>
>();
let lastResumedAt: number | null = null;
let lastFocused: AppWindow | null = null;
let persistWindowsTimer: ReturnType<typeof setTimeout> | undefined;
let pendingAuthProof: { verifier: string; expiresAt: number } | null = null;
const handledAuthStates = new Set<string>();
let pendingAuthUrl: string | null = null;
let pendingCallbackPath: string | null = null;
let isQuitting = false;
const appOrigin = getDesktopAppOrigin();
const homeUrl = getDesktopHomeUrl(appOrigin);
const localMailRendererFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "renderer/index.html",
);
const localMailUrl = shouldUseLocalMailRenderer()
  ? getDesktopLocalMailUrl(localMailRendererFile)
  : null;
const mailNotifier = createMailNotifier({
  origin: appOrigin,
  isFocused: () => appWindows.some(({ window }) => window.isFocused()),
  isSupported: () => Notification.isSupported(),
  createNotification: (options) => new Notification(options),
  openWindow: openAppWindow,
});
type DesktopUpdateStatus =
  | ({ state: "downloading" } & DesktopDownloadProgress)
  | { state: "ready"; version: string }
  | null;

let downloadPercent: number | null = null;
let updateStatus: DesktopUpdateStatus = null;
const updateStatusSubscribers = new Map<WebContents, () => void>();
let refreshDesktopMenu: (() => void) | undefined;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  startDesktopApp();
}

function startDesktopApp() {
  initDesktopSentry();
  nativeTheme.themeSource = "light";
  app.setAppUserModelId("com.getinboxzero.desktop");
  if (shouldSmokeLocalMail()) app.disableHardwareAcceleration();

  ipcMain.on("desktop:ready", (event) => {
    if (!isTrustedDesktopEvent(event)) return;
    loadRecoveryByContents.get(event.sender.id)?.markReady();
  });
  ipcMain.on("desktop:unread-count", (event, count: unknown) => {
    if (!isTrustedDesktopEvent(event)) return;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      return;
    unreadByContents.set(event.sender.id, count);
    applyUnreadBadge();
  });
  ipcMain.handle("desktop:open-window", (event, path: unknown) => {
    if (!isTrustedDesktopEvent(event)) return;
    const callbackPath = normalizeDesktopCallbackPath(path);
    if (!callbackPath) return;
    const url = new URL(callbackPath, appOrigin).toString();
    if (!isAllowedDesktopNavigation(url, appOrigin, localMailRendererFile))
      return;
    openAppWindow(url, { navigate: true });
  });
  ipcMain.handle("mail-engine", (event, payload: unknown) => {
    if (!isTrustedDesktopEvent(event)) return { status: "invalid" };
    return getDesktopMailOwner().handleIpc(payload);
  });
  ipcMain.handle("desktop:read-attachment", (event, payload: unknown) => {
    if (!isTrustedDesktopEvent(event))
      throw new Error("Untrusted attachment request");
    return readDesktopAttachment({
      payload,
      origin: appOrigin,
      fetch: (url, init) => event.sender.session.fetch(url, init),
    });
  });
  registerMailEnginePushIpc({
    ipcMain,
    isTrusted: isTrustedDesktopEvent,
    getOwner: getDesktopMailOwner,
  });
  ipcMain.handle("mail-engine-wipe", async (event) => {
    if (!isTrustedDesktopEvent(event)) return { status: "invalid" };
    await wipeDesktopMailOwner();
    return { status: "ok" };
  });
  ipcMain.handle("desktop:update-status", (event) => {
    if (!isTrustedDesktopEvent(event)) return null;
    subscribeToUpdateStatus(event.sender);
    return updateStatus;
  });
  ipcMain.on("desktop:update-status-unsubscribe", (event) => {
    if (!isTrustedDesktopEvent(event)) return;
    updateStatusSubscribers.get(event.sender)?.();
  });
  ipcMain.handle("desktop:install-update", (event) => {
    if (!isTrustedDesktopEvent(event)) return;
    installUpdate();
  });
  const mainEventLoopDelay = startEventLoopDelayMonitor();
  let lastHealthReadAt = Date.now();
  ipcMain.handle("desktop:health", async (event) => {
    if (!isTrustedDesktopEvent(event)) return null;
    const now = Date.now();
    const intervalMs = now - lastHealthReadAt;
    lastHealthReadAt = now;
    return {
      version: app.getVersion(),
      intervalMs,
      mainEventLoopDelayMs: mainEventLoopDelay.drain(),
      engine: (await desktopMailOwner?.health()) ?? null,
      mailboxBytes: readMailboxBytes(),
    };
  });

  app.on("second-instance", (_event, argv) => {
    const protocolUrl = findDesktopProtocolUrl(argv);
    if (protocolUrl) {
      handleAuthCallbackUrl(protocolUrl).catch(reportSignInError);
    }
    focusAppWindow();
  });

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL);
  }

  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (app.isReady()) {
      handleAuthCallbackUrl(url).catch(reportSignInError);
      return;
    }
    pendingAuthUrl = url;
  });

  ipcMain.handle(
    "desktop-auth:start",
    async (event, provider: unknown, options: unknown) => {
      if (!isTrustedDesktopEvent(event) || !isDesktopAuthProvider(provider)) {
        throw new Error("Unsupported sign-in provider");
      }
      const callbackPath = getStartAuthCallbackPath(options);
      persistPendingCallbackPath(callbackPath);
      try {
        const verifier = randomBytes(32).toString("base64url");
        pendingAuthProof = {
          verifier,
          expiresAt: Date.now() + DESKTOP_AUTH_PROOF_TTL_MS,
        };
        const challenge = createHash("sha256")
          .update(verifier)
          .digest("base64url");
        await openExternal(
          getDesktopBrowserStartUrl(appOrigin, provider, challenge),
        );
      } catch (error) {
        pendingAuthProof = null;
        persistPendingCallbackPath(null);
        throw error;
      }
    },
  );

  app.on("before-quit", () => {
    isQuitting = true;
    // Skip if windows already closed; last-window `close` already wrote the snapshot.
    if (appWindows.length > 0) persistWindowsNow();
    closeDesktopMailOwner().catch(() => undefined);
  });

  app.whenReady().then(async () => {
    let desktopUpdateReady = false;
    const applyDesktopMenu = () => {
      configureDesktopApplicationMenu({
        updateReady: desktopUpdateReady,
        downloadPercent,
        checkForUpdates: () => {
          if (desktopUpdateReady) {
            installUpdate();
            return;
          }
          checkForDesktopUpdatesManually(
            () => {
              isQuitting = true;
            },
            { showsProgressInApp: hasVisibleUpdateStatusSubscriber },
          ).catch(logDesktopUpdateError);
        },
        createWindow: () => createAppWindow(),
        getActiveContents: (window) =>
          appWindows.find((appWindow) => appWindow.window === window)?.activeTab
            .contents,
        openSettings: () => {
          focusAppWindow().activeTab.contents.send("desktop:open-settings");
        },
        recordDiagnostics: () => {
          recordDesktopDiagnostics({
            getMailOwner: () => desktopMailOwner,
            databasePath: desktopMailboxPath(),
          });
        },
      });
    };
    refreshDesktopMenu = applyDesktopMenu;
    applyDesktopMenu();
    if (!shouldSmokeLocalMail()) {
      // Overlap TLS/socket setup with window creation and page load.
      session
        .fromPartition(PARTITION)
        .preconnect({ url: appOrigin, numSockets: 2 });
    }
    session
      .fromPartition(PARTITION)
      .webRequest.onErrorOccurred({ urls: [`${appOrigin}/*`] }, (details) => {
        if (details.webContentsId === undefined) return;
        loadRecoveryByContents
          .get(details.webContentsId)
          ?.recordRequestError(details);
      });
    // A page fetched just before sleep, or while the network was coming back,
    // is the usual cause of a window that never boots.
    powerMonitor.on("resume", () => {
      lastResumedAt = Date.now();
      for (const recovery of loadRecoveryByContents.values()) {
        recovery.retryIfNotBooted();
      }
    });
    restoreAppWindows();
    const startupAuthUrl =
      pendingAuthUrl ?? findDesktopProtocolUrl(process.argv);
    pendingAuthUrl = null;
    if (startupAuthUrl) {
      await handleAuthCallbackUrl(startupAuthUrl);
    }
    if (!shouldSmokeLocalMail()) {
      startDesktopAutoUpdate(undefined, {
        onUpdateReady: (version) => {
          desktopUpdateReady = true;
          setUpdateStatus({ state: "ready", version });
          setDownloadProgress(null);
        },
        onDownloadProgress: setDownloadProgress,
      }).catch(logDesktopUpdateError);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    focusAppWindow();
  });
}

function installUpdate() {
  installDownloadedDesktopUpdate(() => {
    isQuitting = true;
  }).catch(logDesktopUpdateError);
}

function setDownloadProgress(progress: DesktopDownloadProgress | null) {
  downloadPercent = progress?.percent ?? null;
  if (progress) setUpdateStatus({ state: "downloading", ...progress });
  else if (updateStatus?.state === "downloading") setUpdateStatus(null);
  refreshDesktopMenu?.();
  syncUpdateProgressBar();
}

function setUpdateStatus(status: DesktopUpdateStatus) {
  updateStatus = status;
  for (const contents of updateStatusSubscribers.keys()) {
    contents.send("desktop:update-status", status);
  }
}

// A full navigation can land on a page that never subscribes, so it drops the
// subscription; the new page subscribes again if it shows update status.
function subscribeToUpdateStatus(contents: WebContents) {
  if (updateStatusSubscribers.has(contents)) return;
  const unsubscribe = () => {
    updateStatusSubscribers.delete(contents);
    contents.off("did-navigate", unsubscribe);
    contents.off("destroyed", unsubscribe);
  };
  updateStatusSubscribers.set(contents, unsubscribe);
  contents.on("did-navigate", unsubscribe);
  contents.on("destroyed", unsubscribe);
}

// On macOS the last window hides instead of closing, so a toast there would
// go unseen.
function hasVisibleUpdateStatusSubscriber() {
  return [...updateStatusSubscribers.keys()].some((contents) => {
    const match = findTab((tab) => tab.contents === contents);
    return (
      match?.appWindow.activeTab === match?.tab &&
      match?.appWindow.window.isVisible()
    );
  });
}

function syncUpdateProgressBar() {
  const onView = appWindows.some(
    ({ window }) => window.isFocused() && window.isVisible(),
  );
  const progress =
    downloadPercent === null || !onView
      ? -1
      : Math.min(1, Math.max(0, downloadPercent / 100));
  for (const { window } of appWindows) {
    if (!window.isDestroyed()) window.setProgressBar(progress);
  }
}

function restoreAppWindows() {
  for (const state of readStoredWindowStates()) createAppWindow(state);
  if (appWindows.length === 0) createAppWindow();
}

function createAppWindow(options?: {
  url?: string;
  bounds?: DesktopWindowBounds;
  isMaximized?: boolean;
}): AppWindow {
  const existing = appWindows[0];
  if (appWindows.length === 1 && existing && !existing.window.isVisible()) {
    if (options?.url)
      existing.activeTab.contents.loadURL(options.url).catch(() => {});
    showWindow(existing);
    return existing;
  }

  const startUrl = resolveDesktopStartUrl({
    requestedUrl: options?.url,
    localMailUrl,
    homeUrl,
    rendererFile: localMailRendererFile,
  });
  const bounds = resolveWindowBounds(options?.bounds);
  const window = new BaseWindow({
    width: bounds?.width ?? DEFAULT_DESKTOP_WINDOW_WIDTH,
    height: bounds?.height ?? DEFAULT_DESKTOP_WINDOW_HEIGHT,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: MIN_DESKTOP_WINDOW_WIDTH,
    minHeight: MIN_DESKTOP_WINDOW_HEIGHT,
    title: "Inbox Zero",
    ...getDesktopWindowChrome(),
  });
  const tab = createAppTab(startUrl);
  const appWindow: AppWindow = { window, tabs: [tab], activeTab: tab };
  appWindows.push(appWindow);
  lastFocused = appWindow;
  window.contentView.addChildView(tab.view);
  layoutActiveTab(appWindow);
  applyUnreadBadge();

  window.on("resize", () => layoutActiveTab(appWindow));
  window.on("focus", () => {
    lastFocused = appWindow;
    // A BaseWindow does not hand keyboard focus to its views by itself.
    appWindow.activeTab.contents.focus();
    applyUnreadBadge();
    syncUpdateProgressBar();
  });
  // The window can take focus before the listener above exists.
  if (window.isFocused()) tab.contents.focus();
  if (options?.isMaximized) window.maximize();
  window.on("blur", () => {
    syncUpdateProgressBar();
  });
  window.on("moved", schedulePersistWindows);
  window.on("resized", schedulePersistWindows);
  window.on("maximize", schedulePersistWindows);
  window.on("unmaximize", schedulePersistWindows);
  // Keep the last window alive on macOS so reopening from the dock is instant
  // instead of a cold page load. Extra windows close for real.
  window.on("close", (event) => {
    if (
      process.platform === "darwin" &&
      !isQuitting &&
      appWindows.length <= 1
    ) {
      event.preventDefault();
      window.hide();
    } else if (!isQuitting && appWindows.length === 1) {
      // Persist before the last window is removed so quit/close cannot write [].
      persistWindowsNow();
    }
  });
  window.on("closed", () => {
    const index = appWindows.indexOf(appWindow);
    if (index !== -1) appWindows.splice(index, 1);
    for (const tab of appWindow.tabs) destroyAppTab(tab);
    if (lastFocused === appWindow) lastFocused = appWindows.at(-1) ?? null;
    applyUnreadBadge();
    if (!isQuitting && appWindows.length > 0) persistWindowsNow();
  });

  tab.contents.loadURL(startUrl).catch(() => {});
  return appWindow;
}

function createAppTab(startUrl: string): AppTab {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  view.setBackgroundColor(getDesktopWindowChrome().backgroundColor);
  const contents = view.webContents;
  const tab: AppTab = { view, contents };
  rememberTabUrl(tab, startUrl);

  applyNavigationPolicy(contents);
  applyDesktopWindowDragRegion(contents);
  installDesktopContextMenu(contents, {
    getWindow: () =>
      findTab((candidate) => candidate === tab)?.appWindow.window,
    openExternal: (url) => {
      openExternal(url).catch(() => {});
    },
  });
  contents.on("did-navigate", (_event, url) => {
    rememberTabUrl(tab, url);
  });
  contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) rememberTabUrl(tab, url);
  });
  loadRecoveryByContents.set(
    contents.id,
    installDesktopLoadRecovery(contents, {
      appOrigin,
      getStartUrl: () => tab.restoreUrl ?? startUrl,
      onBootFailure: reportBootFailure,
    }),
  );
  if (shouldSmokeLocalMail()) installLocalMailSmoke(contents);
  return tab;
}

// Unlike a BrowserWindow, a BaseWindow does not destroy its views' pages when
// it closes.
function destroyAppTab(tab: AppTab) {
  unreadByContents.delete(tab.contents.id);
  loadRecoveryByContents.delete(tab.contents.id);
  if (!tab.contents.isDestroyed()) tab.contents.close();
}

function layoutActiveTab({ window, activeTab }: AppWindow) {
  const [width, height] = window.getContentSize();
  activeTab.view.setBounds({ x: 0, y: 0, width, height });
}

function reportBootFailure(failure: DesktopBootFailure) {
  captureDesktopError(
    new Error("Desktop web app did not boot"),
    { area: "load-recovery", reason: failure.reason },
    {
      extra: {
        ...failure,
        online: net.isOnline(),
        msSinceResume:
          lastResumedAt === null ? null : Date.now() - lastResumedAt,
      },
    },
  );
}

function resolveWindowBounds(
  stored?: DesktopWindowBounds,
): DesktopWindowBounds | undefined {
  if (stored) {
    return fitWindowBoundsToWorkArea(
      stored,
      screen.getDisplayMatching(stored).workArea,
    );
  }
  const source =
    lastFocused && !lastFocused.window.isDestroyed()
      ? lastFocused.window
      : null;
  if (!source) return;
  const bounds = source.getNormalBounds();
  return fitWindowBoundsToWorkArea(
    { ...bounds, x: bounds.x + 28, y: bounds.y + 28 },
    screen.getDisplayMatching(source.getBounds()).workArea,
  );
}

function rememberTabUrl(tab: AppTab, url: string) {
  if (url.startsWith("data:") || url === "about:blank") return;
  if (URL.parse(url)?.pathname === "/login") {
    tab.restoreUrl = undefined;
    clearMailIndicators();
    schedulePersistWindows();
    return;
  }
  if (getDesktopSessionRestoreUrl(appOrigin, url)) {
    tab.restoreUrl = url;
    schedulePersistWindows();
  }
}

function readStoredWindowStates() {
  try {
    return parseDesktopWindowStates(
      JSON.parse(fs.readFileSync(userDataFile(WINDOWS_STATE_FILE), "utf8")),
      appOrigin,
    );
  } catch {
    return parseDesktopWindowStates([{ url: readLastAppUrl() }], appOrigin);
  }
}

function schedulePersistWindows() {
  clearTimeout(persistWindowsTimer);
  persistWindowsTimer = setTimeout(persistWindowsNow, 200);
}

function persistWindowsNow() {
  clearTimeout(persistWindowsTimer);
  persistWindowsTimer = undefined;
  const states = appWindows
    .flatMap(({ window, activeTab }) => {
      if (window.isDestroyed()) return [];
      const url = activeTab.restoreUrl;
      if (!url) return [];
      return [
        {
          url,
          bounds: window.getNormalBounds(),
          isMaximized: window.isMaximized(),
        },
      ];
    })
    .slice(0, MAX_DESKTOP_WINDOWS);
  try {
    fs.writeFileSync(
      userDataFile(WINDOWS_STATE_FILE),
      JSON.stringify(states),
      "utf8",
    );
    fs.rmSync(userDataFile(LAST_APP_URL_FILE), { force: true });
  } catch {
    // Restoring windows is best-effort; never break navigation over it.
  }
}

function isTrustedDesktopEvent(event: IpcMainEvent | IpcMainInvokeEvent) {
  if (
    !findTab((tab) => tab.contents === event.sender) ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    return false;
  }
  if (event.senderFrame.origin === appOrigin) return true;
  return isDesktopLocalMailUrl(event.sender.getURL(), localMailRendererFile);
}

function applyUnreadBadge() {
  const count =
    lastFocused && !lastFocused.window.isDestroyed()
      ? (unreadByContents.get(lastFocused.activeTab.contents.id) ?? 0)
      : 0;
  setUnreadBadge(count);
}

function setUnreadBadge(count: number) {
  if (process.platform === "darwin")
    app.dock?.setBadge(count ? String(count) : "");
  else if (process.platform === "linux") app.setBadgeCount(count);
}

function clearMailIndicators() {
  unreadByContents.clear();
  applyUnreadBadge();
  mailNotifier.close();
}

function readLastAppUrl(): string | null {
  try {
    return fs.readFileSync(userDataFile(LAST_APP_URL_FILE), "utf8");
  } catch {
    return null;
  }
}

function userDataFile(name: string) {
  return path.join(app.getPath("userData"), name);
}

function applyDesktopWindowDragRegion(contents: WebContents) {
  const dragCss = getDesktopWindowDragCss();
  if (!dragCss) return;
  contents.on("dom-ready", () => {
    contents.insertCSS(dragCss).catch(() => {});
  });
}

function applyNavigationPolicy(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedDesktopNavigation(url, appOrigin, localMailRendererFile)) {
      openAppWindow(url, { navigate: true });
    } else {
      openExternal(url).catch(showSignInError);
    }
    return { action: "deny" };
  });

  contents.on("will-navigate", guardNavigation);
  contents.on("will-redirect", guardNavigation);
}

function guardNavigation(event: { preventDefault: () => void }, url: string) {
  if (isAllowedDesktopNavigation(url, appOrigin, localMailRendererFile)) return;
  event.preventDefault();
  openExternal(url).catch(showSignInError);
}

function openAppWindow(url: string, options?: { navigate?: boolean }) {
  const accountId = getDesktopMailAccountId(url, appOrigin);
  const existing = accountId
    ? findTab((tab) => tabAccountId(tab) === accountId)
    : undefined;
  if (existing) {
    const { appWindow, tab } = existing;
    if (options?.navigate) {
      const current = tab.restoreUrl ?? tab.contents.getURL();
      if (current !== url) tab.contents.loadURL(url).catch(() => {});
    }
    showWindow(appWindow);
    return appWindow;
  }
  return createAppWindow({ url });
}

function findTab(predicate: (tab: AppTab) => boolean) {
  for (const appWindow of appWindows) {
    const tab = appWindow.tabs.find(predicate);
    if (tab) return { appWindow, tab };
  }
}

function tabAccountId(tab: AppTab) {
  return getDesktopMailAccountId(
    tab.restoreUrl ?? tab.contents.getURL(),
    appOrigin,
  );
}

function focusAppWindow(): AppWindow {
  const appWindow =
    (lastFocused && !lastFocused.window.isDestroyed()
      ? lastFocused
      : appWindows[0]) ?? createAppWindow();
  showWindow(appWindow);
  return appWindow;
}

function showWindow({ window }: AppWindow) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function handleAuthCallbackUrl(url: string) {
  const contents = focusAppWindow().activeTab.contents;
  const callback = parseDesktopAuthCallback(url);
  if (!callback.ok) {
    // The callback text comes from the URL, so keep it out of telemetry.
    captureDesktopError(new Error("Authentication callback failed"), {
      area: "sign-in",
    });
    showSignInError(new Error(callback.error));
    return;
  }
  // The server can issue more than one code per sign-in when the browser
  // repeats the callback request.
  if (handledAuthStates.has(callback.state)) return;
  handledAuthStates.add(callback.state);

  try {
    const proof = pendingAuthProof;
    if (!proof || proof.expiresAt <= Date.now()) {
      throw new Error("Start signing in again from the desktop app");
    }
    await exchangeAuthCode(
      contents.session,
      callback.code,
      callback.state,
      proof.verifier,
    );
    if (pendingAuthProof === proof) pendingAuthProof = null;
    await contents.loadURL(consumePostAuthUrl()).catch(() => {});
  } catch (error) {
    handledAuthStates.delete(callback.state);
    reportSignInError(error);
  }
}

async function exchangeAuthCode(
  session: Session,
  code: string,
  state: string,
  codeVerifier: string,
) {
  const response = await session.fetch(
    new URL("/api/mobile-auth/exchange-code", appOrigin).toString(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ code, state, codeVerifier }),
    },
  );

  if (!response.ok) {
    throw new Error("Could not finish signing in");
  }
}

function consumePostAuthUrl() {
  return getDesktopPostAuthUrl(appOrigin, consumePendingCallbackPath());
}

function persistPendingCallbackPath(callbackPath: string | null) {
  pendingCallbackPath = callbackPath;
  const file = getPendingCallbackPathFile();
  if (!callbackPath) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.writeFileSync(file, callbackPath, "utf8");
}

function consumePendingCallbackPath(): string | null {
  const fromMemory = pendingCallbackPath;
  pendingCallbackPath = null;

  let fromDisk: string | null = null;
  try {
    fromDisk = fs.readFileSync(getPendingCallbackPathFile(), "utf8");
  } catch {
    fromDisk = null;
  }
  fs.rmSync(getPendingCallbackPathFile(), { force: true });

  return normalizeDesktopCallbackPath(fromMemory ?? fromDisk);
}

function getPendingCallbackPathFile() {
  return userDataFile(PENDING_CALLBACK_PATH_FILE);
}

function getStartAuthCallbackPath(options: unknown): string | null {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return null;
  }
  if (!("callbackPath" in options)) return null;
  return normalizeDesktopCallbackPath(options.callbackPath);
}

async function openExternal(url: string) {
  if (!isAllowedExternalUrl(url)) return;
  await shell.openExternal(url);
}

function reportSignInError(error: unknown) {
  captureDesktopError(error, { area: "sign-in" });
  showSignInError(error);
}

function showSignInError(error: unknown) {
  dialog.showErrorBox(
    "Sign in failed",
    error instanceof Error ? error.message : "Could not finish signing in",
  );
}

let desktopMailOwner: DesktopMailProcessOwner | undefined;

function getDesktopMailOwner() {
  desktopMailOwner ??= createDesktopMailProcess();
  return desktopMailOwner;
}

function desktopMailboxPath() {
  return path.join(app.getPath("userData"), "mailbox.sqlite");
}

function createDesktopMailProcess() {
  const ses = session.fromPartition(PARTITION);
  return createDesktopMailProcessOwner({
    databasePath: desktopMailboxPath(),
    origin: appOrigin,
    fork: () =>
      utilityProcess.fork(
        path.join(import.meta.dirname, "mail-engine-child.js"),
        [],
        { serviceName: "Inbox Zero Mail Engine" },
      ),
    cookieHeader: async (url) => {
      const cookies = await ses.cookies.get({ url });
      return cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    },
    onNewMail: mailNotifier.notify,
    onEngineError: (error) =>
      captureDesktopError(error, { area: "mail-engine" }),
  });
}

async function closeDesktopMailOwner() {
  const owner = desktopMailOwner;
  desktopMailOwner = undefined;
  await closeDesktopMailbox(owner);
}

async function wipeDesktopMailOwner() {
  const owner = desktopMailOwner;
  desktopMailOwner = undefined;
  await closeAndWipeDesktopMailbox({
    owner,
    databasePath: desktopMailboxPath(),
  });
}

function readMailboxBytes() {
  const databasePath = desktopMailboxPath();
  let bytes = 0;
  for (const file of [databasePath, `${databasePath}-wal`]) {
    try {
      bytes += fs.statSync(file).size;
    } catch {
      // The WAL file only exists while the database is open.
    }
  }
  return bytes;
}

function installLocalMailSmoke(contents: WebContents) {
  const deadline = setTimeout(() => {
    writeLocalMailSmoke({
      url: contents.isDestroyed() ? "" : contents.getURL(),
      ready: false,
    });
    finishLocalMailSmoke(1);
  }, 20_000);

  const onFinish = () => {
    if (contents.isDestroyed()) return;
    const url = contents.getURL();
    if (!url.startsWith("file:")) return;
    contents.off("did-finish-load", onFinish);
    waitForLocalMailReady(contents)
      .then(async (ready) => {
        const engine = ready && (await isLocalMailEngineReady());
        clearTimeout(deadline);
        writeLocalMailSmoke({ url, ready, engine });
        finishLocalMailSmoke(ready && engine ? 0 : 1);
      })
      .catch(() => {
        clearTimeout(deadline);
        writeLocalMailSmoke({ url, ready: false });
        finishLocalMailSmoke(1);
      });
  };
  contents.on("did-finish-load", onFinish);
}

async function waitForLocalMailReady(contents: WebContents) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (contents.isDestroyed()) return false;
    const text = String(
      await contents
        .executeJavaScript('document.body ? document.body.innerText : ""')
        .catch(() => ""),
    );
    if (text.includes("Inbox Zero")) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function isLocalMailEngineReady() {
  const result = await getDesktopMailOwner()
    .handleIpc({
      protocolVersion: 1,
      requestId: "local-mail-smoke",
      method: "inspect",
      payload: {},
    })
    .catch(() => null);
  return result?.status === "ok";
}

function writeLocalMailSmoke(payload: {
  url: string;
  ready: boolean;
  engine?: boolean;
}) {
  process.stdout.write(
    `ELECTRON_PACKAGED_LOCAL_MAIL ${JSON.stringify(payload)}\n`,
  );
}

function finishLocalMailSmoke(code: number) {
  isQuitting = true;
  app.exit(code);
  setTimeout(() => {
    process.exit(code);
  }, 250);
}
