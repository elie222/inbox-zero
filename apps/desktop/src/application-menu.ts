import {
  app,
  type BaseWindow,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";

const PRODUCT_NAME = "Inbox Zero";

export function configureDesktopApplicationMenu({
  checkForUpdates,
  createWindow,
  openSettings,
  recordDiagnostics,
  updateReady = false,
  downloadPercent = null,
  platform = process.platform,
}: {
  checkForUpdates: () => void;
  createWindow: () => void;
  openSettings: () => void;
  recordDiagnostics: () => void;
  updateReady?: boolean;
  downloadPercent?: number | null;
  platform?: NodeJS.Platform;
}) {
  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    applicationVersion: app.getVersion(),
  });

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: updateMenuLabel(updateReady, downloadPercent),
    click: checkForUpdates,
  };
  const settingsItem: MenuItemConstructorOptions = {
    label: "Settings…",
    accelerator: "CommandOrControl+,",
    click: openSettings,
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
              settingsItem,
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
          : [
              { type: "separator" as const },
              settingsItem,
              { type: "separator" as const },
              { role: "quit" as const },
            ]),
      ],
    },
    platform === "darwin" ? macEditMenu : { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Back",
          accelerator: "CommandOrControl+[",
          click: (_item, window) => navigationHistory(window)?.goBack(),
        },
        {
          label: "Forward",
          accelerator: "CommandOrControl+]",
          click: (_item, window) => navigationHistory(window)?.goForward(),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    { role: "help", submenu: helpSubmenu },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Electron's macOS Edit menu, except Paste and Match Style: Electron binds it
// to ⌘⌥⇧V, but browsers use ⌘⇧V.
const macEditMenu: MenuItemConstructorOptions = {
  label: "Edit",
  submenu: [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "pasteAndMatchStyle", accelerator: "CommandOrControl+Shift+V" },
    { role: "delete" },
    { role: "selectAll" },
    { type: "separator" },
    {
      label: "Substitutions",
      submenu: [
        { role: "showSubstitutions" },
        { type: "separator" },
        { role: "toggleSmartQuotes" },
        { role: "toggleSmartDashes" },
        { role: "toggleTextReplacement" },
      ],
    },
    {
      label: "Speech",
      submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
    },
  ],
};

function updateMenuLabel(updateReady: boolean, downloadPercent: number | null) {
  if (updateReady) return "Restart to Update";
  if (downloadPercent === null) return "Check for Updates…";
  return `Downloading update… ${downloadPercent}%`;
}

function navigationHistory(window: BaseWindow | undefined) {
  return window instanceof BrowserWindow
    ? window.webContents.navigationHistory
    : null;
}
