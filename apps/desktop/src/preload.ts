import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("inboxZeroDesktop", {
  setUnreadCount: (count: number) =>
    ipcRenderer.send("desktop:unread-count", count),
  notifyNewMail: (payload: unknown) =>
    ipcRenderer.send("desktop:new-mail", payload),
  openWindow: (path: string) => ipcRenderer.invoke("desktop:open-window", path),
  startAuth: (provider: string, options?: { callbackPath?: string }) =>
    ipcRenderer.invoke("desktop-auth:start", provider, options),
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
  wipeMailbox: () => ipcRenderer.invoke("mail-engine-wipe"),
});
