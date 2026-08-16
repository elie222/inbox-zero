import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("inboxZeroDesktop", {
  startAuth: (provider: string, options?: { callbackPath?: string }) =>
    ipcRenderer.invoke("desktop-auth:start", provider, options),
});
