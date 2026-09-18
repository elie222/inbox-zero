import { createRoot } from "react-dom/client";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { MailApp } from "@inboxzero/mail-ui/MailApp";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { QueryHandle, QuerySnapshot } from "@inboxzero/mail-core/queries";
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

const mailEngine = ipc.mailEngine;
const client: MailClient = {
  observeMailbox: (query) => observeSnapshot("observeMailbox", query),
  observeConversation: (key, page) =>
    observeSnapshot("observeConversation", {
      key,
      after: page.after,
      pageSize: page.pageSize,
    }),
  observeOperation(_key) {
    const snapshot: QuerySnapshot<never> = {
      status: "unavailable",
      revision: null,
      data: null,
      refreshing: false,
      error: { code: "unsupported", retryable: false },
    };
    return {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      close: () => undefined,
    };
  },
  submitMetadata: (payload) => callEngine("submitMetadata", payload),
  submitConversations: (payload) => callEngine("submitConversations", payload),
  saveDraft: (payload) => callEngine("saveDraft", payload),
  readDraft: (payload) => callEngine("readDraft", payload),
  submitSend: (payload) => callEngine("submitSend", payload),
  cancelOperation: (payload) => callEngine("cancelOperation", payload),
  requestSync: (accountIds) => callEngine("requestSync", { accountIds }),
  ensureMessageContent: (key) => callEngine("ensureMessageContent", key),
  getDiagnostics: (accountId) => callEngine("getDiagnostics", { accountId }),
};

const root = document.getElementById("root");
if (root) {
  startLocalMailApp(root, client).catch((error: unknown) => {
    root.textContent =
      error instanceof Error ? error.message : "Mail failed to start";
  });
}

async function startLocalMailApp(
  container: HTMLElement,
  mailClient: MailClient,
) {
  const accountIds = await resolveDesktopAccountIds();
  createRoot(container).render(
    <MailEngineProvider client={mailClient}>
      <MailApp
        accountIds={accountIds}
        host={{
          compose() {},
          openAccount() {},
          openSettings() {},
        }}
      />
    </MailEngineProvider>,
  );
}

async function callEngine(method: string, payload: unknown) {
  const response = (await mailEngine({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    method,
    payload,
  })) as { status?: string; result?: unknown };
  if (response?.status !== "ok") {
    throw new Error(`Mail engine ${method} failed`);
  }
  return response.result as never;
}

function observeSnapshot<T>(
  method: "observeMailbox" | "observeConversation",
  payload: unknown,
): QueryHandle<T> {
  let snapshot: QuerySnapshot<T> = {
    status: "loading",
    revision: null,
    data: null,
    refreshing: true,
    error: null,
  };
  const listeners = new Set<() => void>();
  let closed = false;
  async function refresh() {
    const next = (await callEngine(method, payload)) as QuerySnapshot<T>;
    if (closed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }
  const timer = setInterval(() => {
    refresh().catch(() => undefined);
  }, 750);
  refresh().catch(() => undefined);
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      closed = true;
      clearInterval(timer);
      listeners.clear();
    },
  };
}

async function resolveDesktopAccountIds() {
  const fromQuery = new URLSearchParams(window.location.search).getAll(
    "accountId",
  );
  if (fromQuery.length > 0) return fromQuery;
  const inspection = (await callEngine("inspect", {}).catch(() => ({
    accounts: [] as Array<{ accountId: string }>,
  }))) as { accounts?: Array<{ accountId: string }> };
  return (
    inspection.accounts?.map((account) => account.accountId).filter(Boolean) ??
    []
  );
}
