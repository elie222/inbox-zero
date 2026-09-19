import type { MailClient } from "@inboxzero/mail-core/engine";

let activeMailClient: MailClient | null = null;
const logoutListeners = new Set<() => void>();

export function setActiveMailClient(client: MailClient | null) {
  activeMailClient = client;
}

export function getActiveMailClient() {
  return activeMailClient;
}

export function subscribeMailEngineLogout(listener: () => void) {
  logoutListeners.add(listener);
  return () => {
    logoutListeners.delete(listener);
  };
}

export async function closeActiveMailEngine() {
  for (const listener of [...logoutListeners]) listener();
  const client = activeMailClient;
  activeMailClient = null;
  if (!client) return;
  try {
    await client.close();
  } catch {
    // Logout still proceeds if the worker is already gone.
  }
}
