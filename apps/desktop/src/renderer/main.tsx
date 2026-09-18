import { createRoot } from "react-dom/client";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { MailApp } from "@inboxzero/mail-ui/MailApp";
import type { MailClient } from "@inboxzero/mail-core/engine";

const ipc = window.inboxZeroDesktop;
if (!ipc?.mailEngine) {
  throw new Error("Desktop mail engine IPC is unavailable");
}

const client = {
  observeMailbox() {
    throw new Error("observeMailbox requires the local engine host");
  },
  observeConversation() {
    throw new Error("observeConversation requires the local engine host");
  },
  observeOperation() {
    throw new Error("observeOperation requires the local engine host");
  },
  async submitMetadata(payload) {
    return (
      await ipc.mailEngine({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        method: "submitMetadata",
        payload,
      })
    ).result;
  },
  async requestSync(accountIds) {
    return (
      await ipc.mailEngine({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        method: "requestSync",
        payload: { accountIds },
      })
    ).result;
  },
} as MailClient;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <MailEngineProvider client={client}>
      <MailApp
        accountIds={[]}
        host={{
          compose() {},
          openAccount() {},
          openSettings() {},
        }}
      />
    </MailEngineProvider>,
  );
}
