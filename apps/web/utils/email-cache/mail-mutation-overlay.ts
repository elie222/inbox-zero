import type { ParsedMessage } from "@/utils/types";
import type { MailMutation } from "./mail-mutations";

const HIDE_KINDS = new Set<MailMutation["kind"]>([
  "archive",
  "spam",
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
        getMailMutationThreadKey(mutation.emailAccountId, mutation.threadId),
        () => new Map<string, boolean>(),
      );
      for (const messageId of mutation.messageIds) {
        accountState.visibility.set(messageId, visible);
        visibility.set(messageId, visible);
      }
    }
    if (mutation.kind === "set_starred_state") {
      for (const messageId of mutation.messageIds) {
        accountState.starredStates.set(messageId, mutation.starred);
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
          const updated =
            read === undefined
              ? message
              : updateMessageReadState(message, read);
          const starred = state.starredStates.get(message.id);
          return starred === undefined
            ? updated
            : updateMessageStarredState(updated, starred);
        });
    },
    isThreadHidden(
      emailAccountId: string,
      threadId: string,
      messageIds: string[],
    ) {
      if (messageIds.length === 0) return false;
      const visibility = threadVisibility.get(
        getMailMutationThreadKey(emailAccountId, threadId),
      );
      return messageIds.every(
        (messageId) => visibility?.get(messageId) === false,
      );
    },
  };
}

export function applyMailMutationToMessage<T extends LabeledMessage>(
  message: T,
  mutation: MailMutation,
): T {
  switch (mutation.kind) {
    case "set_read_state":
      return updateMessageReadState(message, mutation.read);
    case "set_starred_state":
      return updateMessageStarredState(message, mutation.starred);
    case "archive":
      return updateMessageLabels(message, {
        add: mutation.labelId ? [mutation.labelId] : [],
        remove: ["INBOX"],
      });
    case "snooze":
      return updateMessageLabels(message, { remove: ["INBOX"] });
    case "unarchive":
    case "cancel_snooze":
      return updateMessageLabels(message, { add: ["INBOX"] });
    case "spam":
      return updateMessageLabels(message, {
        add: ["SPAM"],
        remove: ["INBOX"],
      });
    case "trash":
      return updateMessageLabels(message, {
        add: ["TRASH"],
        remove: ["INBOX"],
      });
    case "untrash":
      return updateMessageLabels(message, {
        add: ["INBOX"],
        remove: ["TRASH"],
      });
    case "reply":
      return message;
  }
}

export function updateMessageReadState<T extends LabeledMessage>(
  message: T,
  read: boolean,
) {
  return updateMessageLabels(
    message,
    read ? { remove: ["UNREAD"] } : { add: ["UNREAD"] },
  );
}

export function updateMessageStarredState<T extends LabeledMessage>(
  message: T,
  starred: boolean,
) {
  return updateMessageLabels(
    message,
    starred ? { add: ["STARRED"] } : { remove: ["STARRED"] },
  );
}

type LabeledMessage = { labelIds?: string[] | null };

function updateMessageLabels<T extends LabeledMessage>(
  message: T,
  {
    add = [],
    remove = [],
  }: {
    add?: string[];
    remove?: string[];
  },
) {
  const labelIds = new Set(message.labelIds ?? []);
  for (const labelId of remove) labelIds.delete(labelId);
  for (const labelId of add) labelIds.add(labelId);
  return { ...message, labelIds: [...labelIds] };
}

type OverlayState = {
  starredStates: Map<string, boolean>;
  readStates: Map<string, boolean>;
  visibility: Map<string, boolean>;
};

function createOverlayState(): OverlayState {
  return {
    starredStates: new Map(),
    readStates: new Map(),
    visibility: new Map(),
  };
}

export function getMailMutationThreadKey(
  emailAccountId: string,
  threadId: string,
) {
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
