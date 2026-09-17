import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { isMailSyncActivated } from "./mail-activation";
import {
  readLocalMailSettings,
  subscribeToLocalMailSettings,
} from "./local-mail-settings";

export function startLocalMailHints(
  emailAccountId: string,
  onChange: () => void,
) {
  if (typeof EventSource === "undefined") return () => {};
  let source: EventSource | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let notification: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let disposed = false;

  function eligible() {
    return (
      !disposed &&
      readLocalMailSettings().pushEnabled &&
      navigator.onLine !== false &&
      isMailSyncActivated(emailAccountId) &&
      (document.visibilityState !== "hidden" || !!getInboxZeroDesktopApp())
    );
  }

  function close() {
    source?.close();
    source = undefined;
    clearTimeout(heartbeat);
    clearTimeout(reconnect);
  }

  function retry() {
    close();
    if (!eligible()) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5));
    reconnect = setTimeout(
      connect,
      Math.min(30_000, delay * (0.8 + Math.random() * 0.4)),
    );
  }

  function changed() {
    if (notification !== undefined) return;
    notification = setTimeout(() => {
      notification = undefined;
      if (eligible()) onChange();
    }, 100);
  }

  function alive() {
    clearTimeout(heartbeat);
    heartbeat = setTimeout(retry, 75_000);
  }

  function connect() {
    if (!eligible() || source) return;
    try {
      const connection = new EventSource(
        `/api/mail-stream?emailAccountId=${encodeURIComponent(emailAccountId)}`,
      );
      source = connection;
      alive();
      connection.addEventListener("ready", () => {
        if (source !== connection) return;
        attempts = 0;
        alive();
        changed();
      });
      connection.addEventListener("heartbeat", () => {
        if (source === connection) alive();
      });
      connection.addEventListener("mailbox-change", () => {
        if (source !== connection) return;
        alive();
        changed();
      });
      connection.onerror = () => {
        if (source === connection) retry();
      };
    } catch {
      retry();
    }
  }

  function wake() {
    if (!eligible()) close();
    else if (!source) {
      clearTimeout(reconnect);
      connect();
    }
  }

  window.addEventListener("online", wake);
  const unsubscribeSettings = subscribeToLocalMailSettings(wake);
  window.addEventListener("offline", wake);
  document.addEventListener("visibilitychange", wake);
  connect();
  return () => {
    disposed = true;
    unsubscribeSettings();
    close();
    clearTimeout(notification);
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
