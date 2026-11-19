import type { MailClient } from "@inboxzero/mail-core/engine";
import { createMailIpcClient } from "@inboxzero/mail-core/protocol/mail-ipc-client";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import {
  pageConnectivityOnline,
  requestSyncUnlessOffline,
} from "@/utils/mail-engine/worker-protocol";

export function hasDesktopMailEngineIpc() {
  const desktop = getInboxZeroDesktopApp();
  return Boolean(
    desktop?.mailEngine &&
      desktop.mailEngineSubscribe &&
      desktop.mailEngineUnsubscribe &&
      desktop.onMailEngineSnapshot,
  );
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
  if (desktop.supportsNoMatchingMessage) return client;

  const observeMailboxWindow = client.observeMailboxWindow;
  return {
    ...client,
    observeMailbox: (query) => client.observeMailbox(legacyMailboxQuery(query)),
    observeMailboxWindow: observeMailboxWindow
      ? (query, options) =>
          observeMailboxWindow(legacyMailboxQuery(query), options)
      : undefined,
    observeMailboxCounts: (query) =>
      client.observeMailboxCounts({
        ...query,
        targets: query.targets.map(legacyMailboxQuery),
      }),
  } satisfies typeof client;
}

export async function startDesktopIpcMailClient(input: {
  provider: "google" | "microsoft";
  accountId: string;
  publish: (client: MailClient) => Promise<void>;
  onSyncError: (error: unknown) => void;
}) {
  const client = createDesktopIpcMailClient({ provider: input.provider });
  await input.publish(client);
  client.requestSync([input.accountId]).catch(input.onSyncError);
}

function legacyMailboxQuery<T extends { predicate: MailPredicate }>(
  query: T,
): T {
  return { ...query, predicate: legacyMailboxPredicate(query.predicate) };
}

function legacyMailboxPredicate(predicate: MailPredicate): MailPredicate {
  if (predicate.kind === "no_matching_message" || predicate.kind === "not") {
    // Older desktop builds only support negation against a single message.
    return {
      kind: "not",
      predicate: legacyMailboxPredicate(predicate.predicate),
    };
  }
  if (predicate.kind === "all" || predicate.kind === "any") {
    return {
      ...predicate,
      predicates: predicate.predicates.map(legacyMailboxPredicate),
    };
  }
  return predicate;
}
