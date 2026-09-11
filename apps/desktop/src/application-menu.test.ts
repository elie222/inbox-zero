import type { MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureDesktopApplicationMenu } from "./application-menu";

const { app, Menu } = vi.hoisted(() => ({
  app: {
    getVersion: vi.fn(() => "0.2.0"),
    setAboutPanelOptions: vi.fn(),
    showAboutPanel: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(
      (template: MenuItemConstructorOptions[]) => template,
    ),
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock("electron", () => ({ app, Menu }));

describe("desktop application menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets Windows users check for updates and view the installed version", () => {
    const checkForUpdates = vi.fn();
    configureDesktopApplicationMenu(checkForUpdates, "win32");

    const template = Menu.buildFromTemplate.mock.results[0].value;
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
});
