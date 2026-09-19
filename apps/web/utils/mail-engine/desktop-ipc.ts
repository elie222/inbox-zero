import { createMailIpcClient } from "@inboxzero/mail-core/protocol/mail-ipc-client";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

export function hasDesktopMailEngineIpc() {
  return typeof getInboxZeroDesktopApp()?.mailEngine === "function";
}

export function createDesktopIpcMailClient() {
  const invoke = getInboxZeroDesktopApp()?.mailEngine;
  if (typeof invoke !== "function") {
    throw new Error("Desktop mail engine IPC is unavailable");
  }
  return createMailIpcClient(invoke);
}
