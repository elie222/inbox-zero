import { app, Menu, type MenuItemConstructorOptions } from "electron";

const PRODUCT_NAME = "Inbox Zero";

export function configureDesktopApplicationMenu({
  checkForUpdates,
  createWindow,
  recordDiagnostics,
  updateReady = false,
  platform = process.platform,
}: {
  checkForUpdates: () => void;
  createWindow: () => void;
  recordDiagnostics: () => void;
  updateReady?: boolean;
  platform?: NodeJS.Platform;
}) {
  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    applicationVersion: app.getVersion(),
  });

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: updateReady ? "Restart to Update" : "Check for Updates…",
    click: checkForUpdates,
  };
  const recordDiagnosticsItem: MenuItemConstructorOptions = {
    label: "Record Diagnostics…",
    click: recordDiagnostics,
  };
  const helpSubmenu: MenuItemConstructorOptions[] =
    platform === "darwin"
      ? [recordDiagnosticsItem]
      : [
          checkForUpdatesItem,
          recordDiagnosticsItem,
          { type: "separator" },
          {
            label: `About ${PRODUCT_NAME}`,
            click: () => app.showAboutPanel(),
          },
        ];
  const template: MenuItemConstructorOptions[] = [
    ...(platform === "darwin"
      ? [
          {
            label: PRODUCT_NAME,
            submenu: [
              { label: `About ${PRODUCT_NAME}`, role: "about" },
              { type: "separator" },
              checkForUpdatesItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { label: `Hide ${PRODUCT_NAME}`, role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { label: `Quit ${PRODUCT_NAME}`, role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: createWindow,
        },
        { role: "close" },
        ...(platform === "darwin"
          ? []
          : [{ type: "separator" as const }, { role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help", submenu: helpSubmenu },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
