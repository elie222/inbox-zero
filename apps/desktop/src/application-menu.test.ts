import type { MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureDesktopApplicationMenu } from "./application-menu";

const { app, BrowserWindow, Menu } = vi.hoisted(() => ({
  app: {
    getVersion: vi.fn(() => "0.2.0"),
    setAboutPanelOptions: vi.fn(),
    showAboutPanel: vi.fn(),
  },
  BrowserWindow: class {
    webContents = {
      navigationHistory: { goBack: vi.fn(), goForward: vi.fn() },
    };
  },
  Menu: {
    buildFromTemplate: vi.fn(
      (template: MenuItemConstructorOptions[]) => template,
    ),
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock("electron", () => ({ app, BrowserWindow, Menu }));

describe("desktop application menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets Windows users check for updates and view the installed version", () => {
    const checkForUpdates = vi.fn();
    configureDesktopApplicationMenu({
      checkForUpdates,
      createWindow: vi.fn(),
      openSettings: vi.fn(),
      recordDiagnostics: vi.fn(),
      platform: "win32",
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(template);
    const help = template.find((item) => item.role === "help");
    const submenu = help?.submenu as MenuItemConstructorOptions[];
    const update = submenu.find((item) => item.label === "Check for Updates…");
    expect(update?.click).toBe(checkForUpdates);

    const about = submenu.find((item) => item.label === "About Inbox Zero");
    expect(about?.click).toEqual(expect.any(Function));
    about?.click?.({} as never, {} as never, {} as never);

    expect(app.setAboutPanelOptions).toHaveBeenCalledWith({
      applicationName: "Inbox Zero",
      applicationVersion: "0.2.0",
    });
    expect(app.showAboutPanel).toHaveBeenCalledOnce();
  });

  it("adds New Window to the File menu", () => {
    const createWindow = vi.fn();
    configureDesktopApplicationMenu({
      checkForUpdates: vi.fn(),
      createWindow,
      openSettings: vi.fn(),
      recordDiagnostics: vi.fn(),
      platform: "darwin",
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    const file = template.find((item) => item.label === "File");
    const submenu = file?.submenu as MenuItemConstructorOptions[];
    const newWindow = submenu.find((item) => item.label === "New Window");
    expect(newWindow?.accelerator).toBe("CommandOrControl+N");
    newWindow?.click?.({} as never, {} as never, {} as never);
    expect(createWindow).toHaveBeenCalledOnce();
  });

  it("offers Restart to Update once a download is ready", () => {
    const checkForUpdates = vi.fn();
    configureDesktopApplicationMenu({
      checkForUpdates,
      createWindow: vi.fn(),
      openSettings: vi.fn(),
      recordDiagnostics: vi.fn(),
      updateReady: true,
      platform: "darwin",
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    const appMenu = template.find((item) => item.label === "Inbox Zero");
    const submenu = appMenu?.submenu as MenuItemConstructorOptions[];
    const update = submenu.find((item) => item.label === "Restart to Update");
    expect(update?.click).toBe(checkForUpdates);
  });

  it("shows download progress in the menu while an update is downloading", () => {
    configureDesktopApplicationMenu({
      checkForUpdates: vi.fn(),
      createWindow: vi.fn(),
      openSettings: vi.fn(),
      recordDiagnostics: vi.fn(),
      downloadPercent: 42,
      platform: "darwin",
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    const appMenu = template.find((item) => item.label === "Inbox Zero");
    const submenu = appMenu?.submenu as MenuItemConstructorOptions[];
    expect(
      submenu.some((item) => item.label === "Downloading update… 42%"),
    ).toBe(true);
  });

  it.each([
    "darwin",
    "win32",
  ] as const)("offers Record Diagnostics in the Help menu on %s", (platform) => {
    const recordDiagnostics = vi.fn();
    configureDesktopApplicationMenu({
      checkForUpdates: vi.fn(),
      createWindow: vi.fn(),
      openSettings: vi.fn(),
      recordDiagnostics,
      platform,
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    const help = template.find((item) => item.role === "help");
    const submenu = help?.submenu as MenuItemConstructorOptions[];
    const record = submenu.find((item) => item.label === "Record Diagnostics…");
    expect(record?.click).toBe(recordDiagnostics);
  });

  it.each([
    { platform: "darwin", menu: "Inbox Zero" },
    { platform: "win32", menu: "File" },
  ] as const)("offers Settings with Cmd/Ctrl+, in the $menu menu on $platform", ({
    platform,
    menu,
  }) => {
    const openSettings = vi.fn();
    configureDesktopApplicationMenu({
      checkForUpdates: vi.fn(),
      createWindow: vi.fn(),
      openSettings,
      recordDiagnostics: vi.fn(),
      platform,
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    const parent = template.find((item) => item.label === menu);
    const submenu = parent?.submenu as MenuItemConstructorOptions[];
    const settings = submenu.find((item) => item.label === "Settings…");
    expect(settings?.accelerator).toBe("CommandOrControl+,");
    expect(settings?.click).toBe(openSettings);
  });

  it("navigates the focused window's history with Cmd/Ctrl+[ and Cmd/Ctrl+]", () => {
    configureDesktopApplicationMenu({
      checkForUpdates: vi.fn(),
      createWindow: vi.fn(),
      openSettings: vi.fn(),
      recordDiagnostics: vi.fn(),
      platform: "darwin",
    });

    const template: MenuItemConstructorOptions[] =
      Menu.buildFromTemplate.mock.results[0].value;
    const view = template.find((item) => item.label === "View");
    const submenu = view?.submenu as MenuItemConstructorOptions[];
    const back = submenu.find((item) => item.label === "Back");
    const forward = submenu.find((item) => item.label === "Forward");
    expect(back?.accelerator).toBe("CommandOrControl+[");
    expect(forward?.accelerator).toBe("CommandOrControl+]");

    const window = new BrowserWindow();
    back?.click?.({} as never, window as never, {} as never);
    expect(window.webContents.navigationHistory.goBack).toHaveBeenCalledOnce();
    forward?.click?.({} as never, window as never, {} as never);
    expect(
      window.webContents.navigationHistory.goForward,
    ).toHaveBeenCalledOnce();
  });
});
