import type { MetadataChange } from "./commands";
import { applyMetadataChange } from "./effective-state";
import type { MailClient } from "./engine";
import type { ConversationKey } from "./identities";
import type { ConversationView } from "./ports/mail-store";
import type {
  ConversationSummary,
  MailboxView,
  QueryHandle,
  QuerySnapshot,
} from "./queries";

type PendingChange = {
  conversations: Set<string>;
  change: MetadataChange;
};

/**
 * Admitting a change means a round trip to the engine, a durable write, and a
 * refresh of every open query, so open views would otherwise trail a keypress
 * by that whole trip. This layers each submitted change over the views until
 * the engine answers; by then its own snapshots carry the change.
 */
export function withOptimisticChanges(client: MailClient): MailClient {
  const pending = new Set<PendingChange>();
  const listeners = new Set<() => void>();
  let version = 0;
  const observeMailboxWindow = client.observeMailboxWindow?.bind(client);

  function notify() {
    version++;
    for (const listener of [...listeners]) listener();
  }

  function overlay<T, H extends QueryHandle<T>>(
    handle: H,
    apply: (data: T, change: PendingChange) => T,
  ): H {
    let cache:
      | { source: QuerySnapshot<T>; version: number; result: QuerySnapshot<T> }
      | undefined;
    return {
      ...handle,
      getSnapshot() {
        const source = handle.getSnapshot();
        if (cache?.source === source && cache.version === version) {
          return cache.result;
        }
        let data = source.data;
        if (data !== null) {
          for (const change of pending) data = apply(data, change);
        }
        const result = data === source.data ? source : { ...source, data };
        cache = { source, version, result };
        return result;
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        const unsubscribe = handle.subscribe(listener);
        return () => {
          listeners.delete(listener);
          unsubscribe();
        };
      },
    };
  }

  return {
    ...client,
    observeMailbox: (query) =>
      overlay(client.observeMailbox(query), applyToMailbox),
    observeMailboxWindow: observeMailboxWindow
      ? (query, options) =>
          overlay(observeMailboxWindow(query, options), applyToMailbox)
      : undefined,
    observeConversation: (key, page) =>
      overlay(client.observeConversation(key, page), applyToConversation),
    async submitConversations(command) {
      const entry: PendingChange = {
        conversations: new Set(command.conversations.map(conversationId)),
        change: command.change,
      };
      pending.add(entry);
      notify();
      try {
        return await client.submitConversations(command);
      } finally {
        pending.delete(entry);
        notify();
      }
    },
  };
}

function applyToMailbox(view: MailboxView, pending: PendingChange) {
  let changed = false;
  const conversations = view.conversations.map((summary) => {
    if (!pending.conversations.has(conversationId(summary.key))) return summary;
    const next = applyToSummary(summary, pending.change);
    if (next !== summary) changed = true;
    return next;
  });
  return changed ? { ...view, conversations } : view;
}

// Changes that move a conversation between mailboxes need the engine's query
// semantics to drop or add rows, so the summary overlay stops at its fields.
function applyToSummary(
  summary: ConversationSummary,
  change: MetadataChange,
): ConversationSummary {
  switch (change.kind) {
    case "set_read":
      return { ...summary, unread: !change.read };
    case "set_starred":
      return { ...summary, starred: change.starred };
    case "set_membership":
      if (change.membership !== "label") return summary;
      return {
        ...summary,
        labelIds: change.present
          ? [...new Set([...summary.labelIds, change.id])]
          : summary.labelIds.filter((id) => id !== change.id),
      };
    default:
      return summary;
  }
}

function applyToConversation(view: ConversationView, pending: PendingChange) {
  if (!pending.conversations.has(conversationId(view.key))) return view;
  return {
    ...view,
    messages: view.messages.map((message) => ({
      ...message,
      metadata: applyMetadataChange(message.metadata, pending.change),
    })),
  };
}

function conversationId(key: ConversationKey) {
  return JSON.stringify([key.accountId, key.conversationId]);
}
