import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  Notification,
  screen,
  session,
  shell,
  type Session,
  type WebContents,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { installDesktopLoadRecovery } from "./load-recovery";
import { configureDesktopApplicationMenu } from "./application-menu";
import {
  checkForDesktopUpdatesManually,
  logDesktopUpdateError,
  startDesktopAutoUpdate,
} from "./auto-update";
import {
  DESKTOP_PROTOCOL,
  findDesktopProtocolUrl,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopHomeUrl,
  getDesktopMailAccountId,
  getDesktopPostAuthUrl,
  getDesktopSessionRestoreUrl,
  getDesktopWindowChrome,
  getDesktopWindowDragCss,
  isAllowedDesktopNavigation,
  isAllowedExternalUrl,
  isDesktopAuthProvider,
  normalizeDesktopCallbackPath,
  parseDesktopAuthCallback,
} from "./desktop";
import { createMailNotificationTracker } from "./mail-notifications";
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
const PENDING_CALLBACK_PATH_FILE = "pending-auth-callback-path";
const LAST_APP_URL_FILE = "last-app-url";
const WINDOWS_STATE_FILE = "windows.json";

const windows: BrowserWindow[] = [];
const lastUrlByWindow = new WeakMap<BrowserWindow, string>();
const unreadByContents = new Map<number, number>();
let lastFocused: BrowserWindow | null = null;
let persistWindowsTimer: ReturnType<typeof setTimeout> | undefined;
let pendingAuthUrl: string | null = null;
let pendingCallbackPath: string | null = null;
let isQuitting = false;
const appOrigin = getDesktopAppOrigin();
const homeUrl = getDesktopHomeUrl(appOrigin);
const trackNewMail = createMailNotificationTracker();
const mailNotifications = new Map<string, Notification>();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  startDesktopApp();
}

function startDesktopApp() {
  nativeTheme.themeSource = "light";
  app.setAppUserModelId("com.getinboxzero.desktop");

  ipcMain.on("desktop:unread-count", (event, count: unknown) => {
    if (!isTrustedDesktopEvent(event)) return;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      return;
    unreadByContents.set(event.sender.id, count);
    setUnreadBadge(Math.max(0, ...unreadByContents.values()));
  });
  ipcMain.on("desktop:new-mail", (event, payload: unknown) => {
    if (!isTrustedDesktopEvent(event)) return;
    const mail = trackNewMail(payload);
    if (
      !mail ||
      windows.some((window) => window.isFocused()) ||
      !Notification.isSupported()
    )
      return;
    const notification = new Notification({
      title: "Inbox Zero",
      body:
        mail.count === 1
          ? "You have a new email"
          : `You have ${mail.count} new emails`,
    });
    mailNotifications.get(mail.emailAccountId)?.close();
    mailNotifications.set(mail.emailAccountId, notification);
    notification.on("click", () => {
      openAppWindow(
        new URL(`/${mail.emailAccountId}/mail`, appOrigin).toString(),
      );
    });
    const release = () => {
      if (mailNotifications.get(mail.emailAccountId) === notification) {
        mailNotifications.delete(mail.emailAccountId);
      }
    };
    notification.on("close", release);
    notification.on("failed", release);
    notification.show();
  });
  ipcMain.handle("desktop:open-window", (event, path: unknown) => {
    if (!isTrustedDesktopEvent(event)) return;
    const callbackPath = normalizeDesktopCallbackPath(path);
    if (!callbackPath) return;
    const url = new URL(callbackPath, appOrigin).toString();
    if (!isAllowedDesktopNavigation(url, appOrigin)) return;
    openAppWindow(url);
  });

  app.on("second-instance", (_event, argv) => {
    const protocolUrl = findDesktopProtocolUrl(argv);
    if (protocolUrl) {
      handleAuthCallbackUrl(protocolUrl).catch(showSignInError);
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
      handleAuthCallbackUrl(url).catch(showSignInError);
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
        await openExternal(getDesktopBrowserStartUrl(appOrigin, provider));
      } catch (error) {
        persistPendingCallbackPath(null);
        throw error;
      }
    },
  );

  app.on("before-quit", () => {
    isQuitting = true;
    persistWindowsNow();
  });

  app.whenReady().then(async () => {
    configureDesktopApplicationMenu({
      checkForUpdates: () => {
        checkForDesktopUpdatesManually(() => {
          isQuitting = true;
        }).catch(logDesktopUpdateError);
      },
      createWindow: () => createAppWindow(),
    });
    // Overlap TLS/socket setup with window creation and page load.
    session
      .fromPartition(PARTITION)
      .preconnect({ url: appOrigin, numSockets: 2 });
    restoreAppWindows();
    const startupAuthUrl =
      pendingAuthUrl ?? findDesktopProtocolUrl(process.argv);
    pendingAuthUrl = null;
    if (startupAuthUrl) {
      await handleAuthCallbackUrl(startupAuthUrl);
    }
    startDesktopAutoUpdate().catch(logDesktopUpdateError);
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

function restoreAppWindows() {
  for (const state of readStoredWindowStates()) createAppWindow(state);
  if (windows.length === 0) createAppWindow();
}

function createAppWindow(options?: {
  url?: string;
  bounds?: DesktopWindowBounds;
  isMaximized?: boolean;
}) {
  const existing = windows[0];
  if (windows.length === 1 && existing && !existing.isVisible()) {
    if (options?.url) existing.loadURL(options.url).catch(() => {});
    showWindow(existing);
    return existing;
  }

  const startUrl = options?.url ?? homeUrl;
  const bounds = resolveWindowBounds(options?.bounds);
  const window = new BrowserWindow({
    width: bounds?.width ?? DEFAULT_DESKTOP_WINDOW_WIDTH,
    height: bounds?.height ?? DEFAULT_DESKTOP_WINDOW_HEIGHT,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: MIN_DESKTOP_WINDOW_WIDTH,
    minHeight: MIN_DESKTOP_WINDOW_HEIGHT,
    title: "Inbox Zero",
    ...getDesktopWindowChrome(),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  windows.push(window);
  lastFocused = window;
  rememberWindowUrl(window, startUrl);
  if (options?.isMaximized) window.maximize();

  window.on("page-title-updated", (event) => {
    event.preventDefault();
  });
  window.on("focus", () => {
    lastFocused = window;
  });
  window.on("moved", schedulePersistWindows);
  window.on("resized", schedulePersistWindows);
  window.on("maximize", schedulePersistWindows);
  window.on("unmaximize", schedulePersistWindows);
  // Keep the last window alive on macOS so reopening from the dock is instant
  // instead of a cold page load. Extra windows close for real.
  window.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting && windows.length <= 1) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    const index = windows.indexOf(window);
    if (index !== -1) windows.splice(index, 1);
    unreadByContents.delete(window.webContents.id);
    applyUnreadBadge();
    if (lastFocused === window) lastFocused = windows.at(-1) ?? null;
    persistWindowsNow();
  });

  applyNavigationPolicy(window.webContents);
  applyDesktopWindowDragRegion(window.webContents);
  window.webContents.on("did-navigate", (_event, url) => {
    rememberWindowUrl(window, url);
  });
  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) rememberWindowUrl(window, url);
  });
  installDesktopLoadRecovery(
    window.webContents,
    appOrigin,
    () => lastUrlByWindow.get(window) ?? startUrl,
  );
  window.loadURL(startUrl).catch(() => {});
  return window;
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
  const source = lastFocused && !lastFocused.isDestroyed() ? lastFocused : null;
  if (!source) return;
  const bounds = source.getNormalBounds();
  return fitWindowBoundsToWorkArea(
    { ...bounds, x: bounds.x + 28, y: bounds.y + 28 },
    screen.getDisplayMatching(source.getBounds()).workArea,
  );
}

function rememberWindowUrl(window: BrowserWindow, url: string) {
  if (url.startsWith("data:") || url === "about:blank") return;
  if (URL.parse(url)?.pathname === "/login") {
    lastUrlByWindow.delete(window);
    clearMailIndicators();
    schedulePersistWindows();
    return;
  }
  if (getDesktopSessionRestoreUrl(appOrigin, url)) {
    lastUrlByWindow.set(window, url);
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
  const states = windows
    .flatMap((window) => {
      if (window.isDestroyed()) return [];
      const url = lastUrlByWindow.get(window);
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
  return (
    windows.some((window) => event.sender === window.webContents) &&
    event.senderFrame === event.sender.mainFrame &&
    event.senderFrame.origin === appOrigin
  );
}

function applyUnreadBadge() {
  setUnreadBadge(Math.max(0, ...unreadByContents.values()));
}

function setUnreadBadge(count: number) {
  if (process.platform === "darwin")
    app.dock?.setBadge(count ? String(count) : "");
  else if (process.platform === "linux") app.setBadgeCount(count);
}

function clearMailIndicators() {
  unreadByContents.clear();
  applyUnreadBadge();
  for (const notification of mailNotifications.values()) notification.close();
  mailNotifications.clear();
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
    if (isAllowedDesktopNavigation(url, appOrigin)) {
      openAppWindow(url);
    } else {
      openExternal(url).catch(showSignInError);
    }
    return { action: "deny" };
  });

  contents.on("will-navigate", guardNavigation);
  contents.on("will-redirect", guardNavigation);
}

function guardNavigation(event: { preventDefault: () => void }, url: string) {
  if (isAllowedDesktopNavigation(url, appOrigin)) return;
  event.preventDefault();
  openExternal(url).catch(showSignInError);
}

function openAppWindow(url: string) {
  const accountId = getDesktopMailAccountId(url, appOrigin);
  const existing = accountId
    ? windows.find((window) => windowAccountId(window) === accountId)
    : undefined;
  if (existing) {
    showWindow(existing);
    return existing;
  }
  return createAppWindow({ url });
}

function windowAccountId(window: BrowserWindow) {
  return getDesktopMailAccountId(
    lastUrlByWindow.get(window) ?? window.webContents.getURL(),
    appOrigin,
  );
}

function focusAppWindow(): BrowserWindow {
  const window =
    (lastFocused && !lastFocused.isDestroyed() ? lastFocused : windows[0]) ??
    createAppWindow();
  showWindow(window);
  return window;
}

function showWindow(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function handleAuthCallbackUrl(url: string) {
  const window = focusAppWindow();
  const callback = parseDesktopAuthCallback(url);
  if (!callback.ok) {
    dialog.showErrorBox("Sign in failed", callback.error);
    return;
  }

  try {
    await exchangeAuthCode(
      window.webContents.session,
      callback.code,
      callback.state,
    );
    await window.loadURL(consumePostAuthUrl()).catch(() => {});
  } catch (error) {
    showSignInError(error);
  }
}

async function exchangeAuthCode(session: Session, code: string, state: string) {
  const response = await session.fetch(
    new URL("/api/mobile-auth/exchange-code", appOrigin).toString(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ code, state }),
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

function showSignInError(error: unknown) {
  dialog.showErrorBox(
    "Sign in failed",
    error instanceof Error ? error.message : "Could not finish signing in",
  );
}
