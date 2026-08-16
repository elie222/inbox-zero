import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type Session,
  type WebContents,
} from "electron";
import { startDesktopAutoUpdate } from "./auto-update";
import {
  DESKTOP_PROTOCOL,
  findDesktopProtocolUrl,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopLoginUrl,
  getDesktopPostAuthUrl,
  getDesktopWindowChrome,
  getDesktopWindowDragCss,
  isAllowedDesktopNavigation,
  isAllowedExternalUrl,
  isDesktopAuthProvider,
  normalizeDesktopCallbackPath,
  parseDesktopAuthCallback,
} from "./desktop";

const PARTITION = "persist:inbox-zero";
const PENDING_CALLBACK_PATH_FILE = "pending-auth-callback-path";

let mainWindow: BrowserWindow | null = null;
let pendingAuthUrl: string | null = null;
let pendingCallbackPath: string | null = null;
const appOrigin = getDesktopAppOrigin();
const loginUrl = getDesktopLoginUrl(appOrigin);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  startDesktopApp();
}

function startDesktopApp() {
  nativeTheme.themeSource = "light";

  app.on("second-instance", (_event, argv) => {
    const protocolUrl = findDesktopProtocolUrl(argv);
    if (protocolUrl) {
      handleAuthCallbackUrl(protocolUrl).catch(showSignInError);
    }
    focusMainWindow();
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
    async (_event, provider: unknown, options: unknown) => {
      if (!isDesktopAuthProvider(provider)) {
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

  app.whenReady().then(async () => {
    createMainWindow();
    await startDesktopAutoUpdate();
    const startupAuthUrl =
      pendingAuthUrl ?? findDesktopProtocolUrl(process.argv);
    pendingAuthUrl = null;
    if (startupAuthUrl) {
      await handleAuthCallbackUrl(startupAuthUrl);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (!mainWindow) {
      createMainWindow();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    title: "Inbox Zero",
    ...getDesktopWindowChrome(),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  applyNavigationPolicy(mainWindow.webContents);
  applyDesktopWindowDragRegion(mainWindow.webContents);
  mainWindow.loadURL(loginUrl).catch(showSignInError);
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
      contents.loadURL(url).catch(showSignInError);
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

function focusMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

async function handleAuthCallbackUrl(url: string) {
  focusMainWindow();
  const callback = parseDesktopAuthCallback(url);
  if (!callback.ok) {
    dialog.showErrorBox("Sign in failed", callback.error);
    return;
  }

  const window = mainWindow;
  if (!window) return;

  try {
    await exchangeAuthCode(
      window.webContents.session,
      callback.code,
      callback.state,
    );
    await window.loadURL(consumePostAuthUrl());
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
  return path.join(app.getPath("userData"), PENDING_CALLBACK_PATH_FILE);
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
