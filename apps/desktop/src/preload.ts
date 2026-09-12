import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("inboxZeroDesktop", {
  setUnreadCount: (count: number) =>
    ipcRenderer.send("desktop:unread-count", count),
  notifyNewMail: (payload: unknown) =>
    ipcRenderer.send("desktop:new-mail", payload),
  openWindow: (path: string) => ipcRenderer.invoke("desktop:open-window", path),
  startAuth: (provider: string, options?: { callbackPath?: string }) =>
    ipcRenderer.invoke("desktop-auth:start", provider, options),
});
