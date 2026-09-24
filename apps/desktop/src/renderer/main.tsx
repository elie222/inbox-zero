import { createRoot } from "react-dom/client";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { MailApp } from "@inboxzero/mail-ui/MailApp";
import { createMailIpcClient } from "@inboxzero/mail-core/protocol/mail-ipc-client";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { InboxZeroDesktopApi } from "./desktop-api";

declare global {
  interface Window {
    inboxZeroDesktop?: InboxZeroDesktopApi;
  }
}

const ipc = window.inboxZeroDesktop;
if (!ipc?.mailEngine) {
  throw new Error("Desktop mail engine IPC is unavailable");
}

const client = createMailIpcClient(ipc.mailEngine, {
  push: {
    subscribe: ipc.mailEngineSubscribe,
    unsubscribe: ipc.mailEngineUnsubscribe,
    onSnapshot: ipc.onMailEngineSnapshot,
  },
});

const root = document.getElementById("root");
if (root) {
  startLocalMailApp(root, client).catch((error: unknown) => {
    root.textContent =
      error instanceof Error ? error.message : "Mail failed to start";
  });
}

async function startLocalMailApp(
  container: HTMLElement,
  mailClient: MailClient & { inspect: () => Promise<unknown> },
) {
  const accountIds = await resolveDesktopAccountIds(mailClient);
  createRoot(container).render(
    <MailEngineProvider client={mailClient}>
      <MailApp
        accountIds={accountIds}
        host={{
          openSettings: () => openPrimaryAccountPath(accountIds, "settings"),
        }}
      />
    </MailEngineProvider>,
  );
}

function openPrimaryAccountPath(
  accountIds: string[],
  section: "mail" | "settings",
) {
  const accountId = accountIds[0];
  if (accountId) openHostedWindow(`/${accountId}/${section}`);
}

function openHostedWindow(path: string) {
  ipc?.openWindow?.(path).catch(() => undefined);
}

async function resolveDesktopAccountIds(
  mailClient: MailClient & { inspect: () => Promise<unknown> },
) {
  const fromQuery = new URLSearchParams(window.location.search).getAll(
    "accountId",
  );
  if (fromQuery.length > 0) return fromQuery;
  const inspection = (await mailClient.inspect().catch(() => ({
    accounts: [] as Array<{ accountId: string }>,
  }))) as { accounts?: Array<{ accountId: string }> };
  return (
    inspection.accounts?.map((account) => account.accountId).filter(Boolean) ??
    []
  );
}
