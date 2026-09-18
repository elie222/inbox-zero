import type { MailClient } from "@inboxzero/mail-core/engine";

let activeMailClient: MailClient | null = null;

export function setActiveMailClient(client: MailClient | null) {
  activeMailClient = client;
}

export function getActiveMailClient() {
  return activeMailClient;
}
