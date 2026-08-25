import { app, Menu, type MenuItemConstructorOptions } from "electron";

const PRODUCT_NAME = "Inbox Zero";

export function configureDesktopApplicationMenu(
  checkForUpdates: () => void,
  platform = process.platform,
) {
  app.setAboutPanelOptions({ applicationName: PRODUCT_NAME });

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: checkForUpdates,
  };
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
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    ...(platform === "darwin"
      ? []
      : [
          {
            role: "help",
            submenu: [checkForUpdatesItem],
          } satisfies MenuItemConstructorOptions,
        ]),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
