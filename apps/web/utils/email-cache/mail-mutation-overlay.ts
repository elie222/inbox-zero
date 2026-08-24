import type { ParsedMessage } from "@/utils/types";
import type { MailMutation } from "./mail-mutations";

const HIDE_KINDS = new Set<MailMutation["kind"]>([
  "archive",
  "trash",
  "snooze",
]);
const SHOW_KINDS = new Set<MailMutation["kind"]>([
  "unarchive",
  "untrash",
  "cancel_snooze",
]);

export function applyMailMutationOverlayToMessages({
  emailAccountId,
  messages,
  mutations,
}: {
  emailAccountId: string;
  messages: ParsedMessage[];
  mutations: MailMutation[];
}) {
  return createMailMutationOverlay(mutations).applyToMessages(
    emailAccountId,
    messages,
  );
}

export function isThreadHiddenByMailMutations({
  emailAccountId,
  messageIds,
  mutations,
  threadId,
}: {
  emailAccountId: string;
  messageIds: string[];
  mutations: MailMutation[];
  threadId: string;
}) {
  return createMailMutationOverlay(mutations).isThreadHidden(
    emailAccountId,
    threadId,
    messageIds,
  );
}

export function createMailMutationOverlay(mutations: MailMutation[]) {
  const accountStates = new Map<string, OverlayState>();
  const threadVisibility = new Map<string, Map<string, boolean>>();
  const ordered = [...mutations].sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
  for (const mutation of ordered) {
    const accountState = getOrCreate(
      accountStates,
      mutation.emailAccountId,
      () => createOverlayState(),
    );
    const visible = SHOW_KINDS.has(mutation.kind)
      ? true
      : HIDE_KINDS.has(mutation.kind)
        ? false
        : undefined;

    if (visible !== undefined) {
      const visibility = getOrCreate(
        threadVisibility,
        threadKey(mutation.emailAccountId, mutation.threadId),
        () => new Map<string, boolean>(),
      );
      for (const messageId of mutation.messageIds) {
        accountState.visibility.set(messageId, visible);
        visibility.set(messageId, visible);
      }
    }
    if (mutation.kind === "set_read_state") {
      for (const messageId of mutation.messageIds) {
        accountState.readStates.set(messageId, mutation.read);
      }
    }
  }

  return {
    applyToMessages(emailAccountId: string, messages: ParsedMessage[]) {
      const state = accountStates.get(emailAccountId);
      if (!state) return messages;
      return messages
        .filter((message) => state.visibility.get(message.id) !== false)
        .map((message) => {
          const read = state.readStates.get(message.id);
          return read === undefined
            ? message
            : updateMessageReadState(message, read);
        });
    },
    isThreadHidden(
      emailAccountId: string,
      threadId: string,
      messageIds: string[],
    ) {
      if (messageIds.length === 0) return false;
      const visibility = threadVisibility.get(
        threadKey(emailAccountId, threadId),
      );
      return messageIds.every(
        (messageId) => visibility?.get(messageId) === false,
      );
    },
  };
}

export function updateMessageReadState(message: ParsedMessage, read: boolean) {
  const labelIds = new Set(message.labelIds ?? []);
  if (read) labelIds.delete("UNREAD");
  else labelIds.add("UNREAD");
  return { ...message, labelIds: [...labelIds] };
}

type OverlayState = {
  readStates: Map<string, boolean>;
  visibility: Map<string, boolean>;
};

function createOverlayState(): OverlayState {
  return { readStates: new Map(), visibility: new Map() };
}

function threadKey(emailAccountId: string, threadId: string) {
  return `${emailAccountId}\u0000${threadId}`;
}

function getOrCreate<Key, Value>(
  map: Map<Key, Value>,
  key: Key,
  create: () => Value,
) {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const value = create();
  map.set(key, value);
  return value;
}
