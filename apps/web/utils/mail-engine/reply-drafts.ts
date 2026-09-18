import type {
  EmailComposerAttachment,
  PreparedEmailDraft,
} from "@inboxzero/email-editor/core";
import type { EmailEditorPreservedBlock } from "@inboxzero/email-editor/web";
import type { SendEmailBody } from "@/utils/types/mail";

export type ReplyDraftContent = {
  providerDraftId?: string;
  providerDraftCreationUnconfirmed?: boolean;
  composeMode?: ReplyDraftMode;
  requestId?: string;
  deliveryPath?: "scheduled" | "outbox";
  values: Omit<SendEmailBody, "attachments" | "messageHtml">;
  draft: PreparedEmailDraft;
  preservedBlocks: EmailEditorPreservedBlock[];
  attachments: EmailComposerAttachment[];
  sendAt?: string;
  remindAt?: string;
};

export type StoredReplyDraft = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  revision: number;
  content: ReplyDraftContent | null;
  updatedAt: number;
};

export type ReplyDraftIdentity = Pick<
  StoredReplyDraft,
  "emailAccountId" | "threadId" | "messageId"
>;
export type ReplyDraftMode = "reply" | "forward";
type ReplyDraftScope = Pick<ReplyDraftIdentity, "emailAccountId" | "threadId">;

const drafts = new Map<string, StoredReplyDraft>();
const pendingWrites = new Map<string, Promise<unknown>>();
const listeners = new Set<(scope: ReplyDraftScope) => void>();
const accountEpoch = new Map<string, number>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("inbox-zero-reply-drafts")
    : null;

export function getReplyDraftSessionId(
  messageId: string,
  mode: ReplyDraftMode,
) {
  return `${messageId}:${mode}`;
}

channel?.addEventListener("message", (event) => {
  const scope = event.data;
  if (
    typeof scope?.emailAccountId !== "string" ||
    typeof scope?.threadId !== "string"
  )
    return;
  for (const listener of listeners) listener(scope);
});

export function subscribeToReplyDrafts(
  listener: (scope: ReplyDraftScope) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getReplyDraft(identity: ReplyDraftIdentity) {
  await pendingWrites.get(draftKey(identity))?.catch(() => {});
  assertAccountEpoch(identity.emailAccountId);
  return drafts.get(draftKey(identity));
}

export async function getReplyDraftForSession(
  identity: ReplyDraftIdentity,
  legacyIdentity?: ReplyDraftIdentity,
  mode?: ReplyDraftMode,
) {
  const current = await getReplyDraft(identity);
  if (current || !legacyIdentity || !mode) return current;
  const legacy = await getReplyDraft(legacyIdentity);
  if (!legacy?.content || getReplyDraftMode(legacy) !== mode) return;
  const migrated: StoredReplyDraft = {
    ...identity,
    content: { ...legacy.content, composeMode: mode },
    revision: 1,
    updatedAt: Date.now(),
  };
  drafts.set(draftKey(identity), migrated);
  drafts.set(draftKey(legacyIdentity), {
    ...legacy,
    content: null,
    revision: legacy.revision + 1,
    updatedAt: Date.now(),
  });
  notifyReplyDraftChange(identity);
  notifyReplyDraftChange(legacyIdentity);
  return migrated;
}

export function getReplyDraftMode(draft: StoredReplyDraft) {
  if (!draft.content) return;
  if (draft.content.composeMode) return draft.content.composeMode;
  return getComposeMode(draft.content.values.replyToEmail);
}

export async function updateReplyDraftProviderState(
  identity: ReplyDraftIdentity,
  requestId: string,
  draftId?: string,
) {
  await pendingWrites.get(draftKey(identity))?.catch(() => {});
  assertAccountEpoch(identity.emailAccountId);
  const current = drafts.get(draftKey(identity));
  if (!current?.content || current.content.requestId !== requestId) {
    throw new Error("This draft changed. Reopen the composer.");
  }
  if (current.content.providerDraftId) return current.content.providerDraftId;
  if (!draftId && current.content.providerDraftCreationUnconfirmed) {
    throw new Error(
      "Mailbox draft creation could not be confirmed. Check Drafts in Gmail or Outlook; your message is still saved on this device.",
    );
  }
  drafts.set(draftKey(identity), {
    ...current,
    content: {
      ...current.content,
      providerDraftId: draftId,
      providerDraftCreationUnconfirmed: !draftId,
    },
  });
  return draftId;
}

export async function getReplyDrafts(emailAccountId: string, threadId: string) {
  assertAccountEpoch(emailAccountId);
  return [...drafts.values()].filter(
    (draft) =>
      draft.emailAccountId === emailAccountId &&
      draft.threadId === threadId &&
      draft.content !== null,
  );
}

export function createReplyDraftWriter(
  identity: ReplyDraftIdentity,
  initialRevision = 0,
) {
  let revision = initialRevision;
  let stopped = false;
  let pending: Promise<unknown> = Promise.resolve();
  const epoch = currentEpoch(identity.emailAccountId);
  const write = (content: ReplyDraftContent | null) => {
    const operation = pending
      .catch(() => {})
      .then(async () => {
        assertAccountEpoch(identity.emailAccountId, epoch);
        const previous = drafts.get(draftKey(identity));
        if ((previous?.revision ?? 0) !== revision) {
          throw new Error(
            "This draft changed in another tab. Reopen the composer to load that version.",
          );
        }
        let nextContent = content;
        if (
          content &&
          previous?.content &&
          previous.content.requestId === content.requestId
        ) {
          nextContent = {
            ...content,
            ...(previous.content.providerDraftId && {
              providerDraftId: previous.content.providerDraftId,
            }),
            ...(previous.content.providerDraftCreationUnconfirmed !==
              undefined && {
              providerDraftCreationUnconfirmed:
                previous.content.providerDraftCreationUnconfirmed,
            }),
          };
        }
        drafts.set(draftKey(identity), {
          ...identity,
          content: nextContent,
          revision: revision + 1,
          updatedAt: Date.now(),
        });
        revision += 1;
        if (Boolean(previous?.content) !== Boolean(content)) {
          notifyReplyDraftChange(identity);
        }
      });
    pending = operation;
    const identityKey = draftKey(identity);
    pendingWrites.set(identityKey, operation);
    operation.then(
      () => clearPendingWrite(identityKey, operation),
      () => clearPendingWrite(identityKey, operation),
    );
    return operation;
  };
  return {
    save(content: ReplyDraftContent) {
      if (stopped) {
        return Promise.reject(
          new Error(
            "This draft is closed. Reopen the composer before editing.",
          ),
        );
      }
      return write(content);
    },
    clear() {
      stopped = true;
      return write(null).catch((error) => {
        stopped = false;
        throw error;
      });
    },
  };
}

export function clearLocalReplyDrafts(emailAccountId?: string) {
  if (!emailAccountId) {
    drafts.clear();
    for (const accountId of accountEpoch.keys()) {
      accountEpoch.set(accountId, currentEpoch(accountId) + 1);
    }
    return;
  }
  accountEpoch.set(emailAccountId, currentEpoch(emailAccountId) + 1);
  for (const [key, draft] of drafts) {
    if (draft.emailAccountId === emailAccountId) drafts.delete(key);
  }
}

function draftKey(identity: ReplyDraftIdentity) {
  return JSON.stringify([
    identity.emailAccountId,
    identity.threadId,
    identity.messageId,
  ]);
}

function currentEpoch(emailAccountId: string) {
  return accountEpoch.get(emailAccountId) ?? 0;
}

function assertAccountEpoch(emailAccountId: string, expected?: number) {
  const epoch = currentEpoch(emailAccountId);
  if (expected !== undefined && expected !== epoch) {
    throw new Error("This account's local draft storage was cleared.");
  }
}

function clearPendingWrite(identityKey: string, operation: Promise<unknown>) {
  if (pendingWrites.get(identityKey) === operation) {
    pendingWrites.delete(identityKey);
  }
}

function notifyReplyDraftChange(scope: ReplyDraftScope) {
  for (const listener of listeners) listener(scope);
  channel?.postMessage(scope);
}

function getComposeMode(
  replyToEmail: SendEmailBody["replyToEmail"],
): ReplyDraftMode {
  return replyToEmail?.headerMessageId ? "reply" : "forward";
}
