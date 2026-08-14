import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("inboxZeroDesktop", {
  startAuth: (provider: string) =>
    ipcRenderer.invoke("desktop-auth:start", provider),
});
