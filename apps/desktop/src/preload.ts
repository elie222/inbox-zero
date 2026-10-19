import { contextBridge, ipcRenderer } from "electron";

// The menu can fire before the page subscribes (e.g. a window still loading),
// so hold the request until a listener arrives.
let openSettingsListener: (() => void) | null = null;
let openSettingsPending = false;
ipcRenderer.on("desktop:open-settings", () => {
  if (openSettingsListener) openSettingsListener();
  else openSettingsPending = true;
});

contextBridge.exposeInMainWorld("inboxZeroDesktop", {
  setUnreadCount: (count: number) =>
    ipcRenderer.send("desktop:unread-count", count),
  signalReady: () => ipcRenderer.send("desktop:ready"),
  openWindow: (path: string) => ipcRenderer.invoke("desktop:open-window", path),
  startAuth: (provider: string, options?: { callbackPath?: string }) =>
    ipcRenderer.invoke("desktop-auth:start", provider, options),
  readAttachment: (payload: unknown) =>
    ipcRenderer.invoke("desktop:read-attachment", payload),
  mailEngine: (payload: unknown) => ipcRenderer.invoke("mail-engine", payload),
  mailEngineSubscribe: (input: unknown) =>
    ipcRenderer.invoke("mail-engine-subscribe", input),
  mailEngineUnsubscribe: (subscriptionId: string) =>
    ipcRenderer.invoke("mail-engine-unsubscribe", subscriptionId),
  onMailEngineSnapshot: (listener: (event: unknown) => void) => {
    const handler = (_event: unknown, message: unknown) => listener(message);
    ipcRenderer.on("mail-engine-snapshot", handler);
    return () => {
      ipcRenderer.removeListener("mail-engine-snapshot", handler);
    };
  },
  onOpenSettings: (listener: () => void) => {
    openSettingsListener = listener;
    if (openSettingsPending) {
      openSettingsPending = false;
      listener();
    }
    return () => {
      if (openSettingsListener === listener) openSettingsListener = null;
    };
  },
  onUpdateStatus: (listener: (status: unknown) => void) => {
    let subscribed = true;
    const handler = (_event: unknown, status: unknown) => listener(status);
    ipcRenderer.on("desktop:update-status", handler);
    ipcRenderer.invoke("desktop:update-status").then((status) => {
      if (subscribed) listener(status);
    });
    return () => {
      subscribed = false;
      ipcRenderer.removeListener("desktop:update-status", handler);
      ipcRenderer.send("desktop:update-status-unsubscribe");
    };
  },
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  wipeMailbox: () => ipcRenderer.invoke("mail-engine-wipe"),
  getDesktopHealth: () => ipcRenderer.invoke("desktop:health"),
});
