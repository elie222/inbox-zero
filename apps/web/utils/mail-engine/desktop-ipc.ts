import { createMailIpcClient } from "@inboxzero/mail-core/protocol/mail-ipc-client";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import {
  pageConnectivityOnline,
  requestSyncUnlessOffline,
} from "@/utils/mail-engine/worker-protocol";

export function hasDesktopMailEngineIpc() {
  return typeof getInboxZeroDesktopApp()?.mailEngine === "function";
}

export function createDesktopIpcMailClient(input?: {
  provider?: "google" | "microsoft";
}) {
  const desktop = getInboxZeroDesktopApp();
  const invoke = desktop?.mailEngine;
  const subscribe = desktop?.mailEngineSubscribe;
  const unsubscribe = desktop?.mailEngineUnsubscribe;
  const onSnapshot = desktop?.onMailEngineSnapshot;
  if (!invoke || !subscribe || !unsubscribe || !onSnapshot) {
    throw new Error("Desktop mail engine IPC is unavailable");
  }
  const client = createMailIpcClient(invoke, {
    provider: input?.provider,
    push: { subscribe, unsubscribe, onSnapshot },
  });
  const originalRequestSync = client.requestSync.bind(client);
  client.requestSync = (accountIds) =>
    requestSyncUnlessOffline(pageConnectivityOnline(), () =>
      originalRequestSync(accountIds),
    );
  return client;
}
