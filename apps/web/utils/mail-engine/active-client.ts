import type { MailClient } from "@inboxzero/mail-core/engine";

let activeMailClient: MailClient | null = null;

export function setActiveMailClient(client: MailClient | null) {
  activeMailClient = client;
}

export function getActiveMailClient() {
  return activeMailClient;
}

export async function closeActiveMailEngine() {
  const client = activeMailClient;
  activeMailClient = null;
  if (!client) return;
  try {
    await client.close();
  } catch {
    // Logout still proceeds if the worker is already gone.
  }
}
