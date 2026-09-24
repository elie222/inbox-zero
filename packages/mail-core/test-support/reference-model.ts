import {
  deriveEffectiveMessage,
  type ConfirmedMessage,
  type PendingEffect,
} from "../src/effective-state";
import type { MessageMetadata } from "../src/messages";
import {
  conversationIsUnread,
  conversationMatchesPredicate,
  type EffectiveMessage,
} from "../src/query-semantics";
import type { MailPredicate } from "../src/queries";
import type { ProviderChange } from "../src/sync";
import { applyMetadataPatch } from "../src/effective-state";

export type ReferenceState = {
  messages: Map<string, ConfirmedMessage>;
  pending: PendingEffect[];
  bodies: Map<string, { html: string | null; text: string | null }>;
};

export function createReferenceModel(): ReferenceState {
  return {
    messages: new Map(),
    pending: [],
    bodies: new Map(),
  };
}

export function applyReferenceChange(
  state: ReferenceState,
  change: ProviderChange,
): void {
  if (change.kind === "message_patch") {
    const id = `${change.key.accountId}:${change.key.messageId}`;
    const current = state.messages.get(id);
    const base: MessageMetadata = current ?? {
      subject: "",
      preview: "",
      from: "",
      to: [],
      cc: [],
      receivedAtMs: 0,
      read: true,
      starred: false,
      folderId: null,
      labelIds: [],
      categoryIds: [],
      roles: [],
      hasAttachments: false,
    };
    const metadata = applyMetadataPatch(base, change.fields);
    state.messages.set(id, {
      ...metadata,
      accountId: change.key.accountId,
      messageId: change.key.messageId,
      conversationId: change.reference.conversationId,
      version: change.reference.version,
      deleted: false,
    });
    return;
  }
  if (change.kind === "message_deleted") {
    const id = `${change.key.accountId}:${change.key.messageId}`;
    const current = state.messages.get(id);
    if (current) state.messages.set(id, { ...current, deleted: true });
  }
}

export function setReferencePending(
  state: ReferenceState,
  pending: PendingEffect[],
): void {
  state.pending = pending;
}

export function referenceMailbox(
  state: ReferenceState,
  accountIds: string[],
  predicate: MailPredicate,
): {
  conversations: string[];
  matchingConversations: number;
  unreadConversations: number;
} {
  const grouped = new Map<string, EffectiveMessage[]>();
  for (const message of state.messages.values()) {
    if (!accountIds.includes(message.accountId) || message.deleted) continue;
    const effective = deriveEffectiveMessage(message, state.pending);
    const key = `${effective.accountId}:${effective.conversationId}`;
    const list = grouped.get(key) ?? [];
    list.push(effective);
    grouped.set(key, list);
  }
  const matching = [...grouped.entries()].filter(([, messages]) =>
    conversationMatchesPredicate(messages, predicate),
  );
  matching.sort((left, right) => {
    const leftTime = Math.max(
      ...left[1].map((message) => message.receivedAtMs),
    );
    const rightTime = Math.max(
      ...right[1].map((message) => message.receivedAtMs),
    );
    if (rightTime !== leftTime) return rightTime - leftTime;
    return left[0].localeCompare(right[0]);
  });
  return {
    conversations: matching.map(([key]) => key),
    matchingConversations: matching.length,
    unreadConversations: matching.filter(([, messages]) =>
      conversationIsUnread(messages, predicate),
    ).length,
  };
}
