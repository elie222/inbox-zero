import { createRoot } from "react-dom/client";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { MailApp } from "@inboxzero/mail-ui/MailApp";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { QueryHandle, QuerySnapshot } from "@inboxzero/mail-core/queries";

const ipc = window.inboxZeroDesktop;
if (!ipc?.mailEngine) {
  throw new Error("Desktop mail engine IPC is unavailable");
}

function callEngine(method: string, payload: unknown) {
  return ipc.mailEngine({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    method,
    payload,
  });
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
    const response = await callEngine(method, payload);
    if (closed) return;
    snapshot = (response?.result ?? snapshot) as QuerySnapshot<T>;
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

type DesktopMailClient = MailClient & {
  inspect(): Promise<{ accounts?: Array<{ accountId: string }> } | null>;
};

const client: DesktopMailClient = {
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
  async submitMetadata(payload) {
    return (await callEngine("submitMetadata", payload)).result;
  },
  async submitConversations(payload) {
    return (await callEngine("submitConversations", payload)).result;
  },
  async saveDraft(payload) {
    return (await callEngine("saveDraft", payload)).result;
  },
  async submitSend(payload) {
    return (await callEngine("submitSend", payload)).result;
  },
  async cancelOperation(payload) {
    return (await callEngine("cancelOperation", payload)).result;
  },
  async requestSync(accountIds) {
    return (await callEngine("requestSync", { accountIds })).result;
  },
  async ensureMessageContent(key) {
    return (await callEngine("ensureMessageContent", key)).result;
  },
  async getDiagnostics(accountId) {
    return (await callEngine("getDiagnostics", { accountId })).result;
  },
  async inspect() {
    return (await callEngine("inspect", {})).result;
  },
};

const root = document.getElementById("root");
if (root) {
  const accountIds = await resolveDesktopAccountIds(client);
  createRoot(root).render(
    <MailEngineProvider client={client}>
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

async function resolveDesktopAccountIds(mailClient: DesktopMailClient) {
  const fromQuery = new URLSearchParams(window.location.search).getAll(
    "accountId",
  );
  if (fromQuery.length > 0) return fromQuery;
  const inspection = await mailClient.inspect().catch(() => ({
    accounts: [] as Array<{ accountId: string }>,
  }));
  return (
    inspection?.accounts?.map((account) => account.accountId).filter(Boolean) ??
    []
  );
}
