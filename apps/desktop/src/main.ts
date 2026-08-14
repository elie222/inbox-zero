import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type Session,
} from "electron";
import {
  DESKTOP_PROTOCOL,
  findDesktopProtocolUrl,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopLoginUrl,
  isAllowedDesktopNavigation,
  isDesktopAuthProvider,
  parseDesktopAuthCallback,
} from "./desktop";

const PARTITION = "persist:inbox-zero";

let mainWindow: BrowserWindow | null = null;
let pendingAuthUrl: string | null = null;
const appOrigin = getDesktopAppOrigin();
const loginUrl = getDesktopLoginUrl(appOrigin);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  startDesktopApp();
}

function startDesktopApp() {
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

  ipcMain.handle("desktop-auth:start", async (_event, provider: unknown) => {
    if (!isDesktopAuthProvider(provider)) {
      throw new Error("Unsupported sign-in provider");
    }
    await shell.openExternal(getDesktopBrowserStartUrl(appOrigin, provider));
  });

  app.whenReady().then(async () => {
    createMainWindow();
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
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedDesktopNavigation(url, appOrigin)) {
      return { action: "allow" };
    }
    openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedDesktopNavigation(url, appOrigin)) return;
    event.preventDefault();
    openExternal(url);
  });

  mainWindow.loadURL(loginUrl).catch(showSignInError);
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
    await window.loadURL(loginUrl);
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

function openExternal(url: string) {
  shell.openExternal(url).catch(showSignInError);
}

function showSignInError(error: unknown) {
  dialog.showErrorBox(
    "Sign in failed",
    error instanceof Error ? error.message : "Could not finish signing in",
  );
}
