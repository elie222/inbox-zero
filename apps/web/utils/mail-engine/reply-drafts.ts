import type { DraftSaveResult } from "@inboxzero/mail-core/drafts";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type {
  EmailComposerAttachment,
  PreparedEmailDraft,
} from "@inboxzero/email-editor/core";
import type { EmailEditorPreservedBlock } from "@inboxzero/email-editor/web";
import { splitRecipientList } from "@/utils/email";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import { releaseSendAttachmentHolds } from "@/utils/mail-engine/stage-attachments";
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
const engineRevisions = new Map<string, number>();
// Gmail stores every draft save as a new message. Remembering which message a
// draft was first opened from keeps its composer and local draft across saves.
const draftSessionMessageIds = new Map<string, Map<string, string>>();
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

export function rememberReplacedDraftMessage(
  emailAccountId: string,
  previousMessageId: string,
  nextMessageId: string,
) {
  const sessionMessageId = getDraftSessionMessageId(
    emailAccountId,
    previousMessageId,
  );
  const accountSessions =
    draftSessionMessageIds.get(emailAccountId) ?? new Map<string, string>();
  accountSessions.set(nextMessageId, sessionMessageId);
  draftSessionMessageIds.set(emailAccountId, accountSessions);
}

export function getDraftSessionMessageId(
  emailAccountId: string,
  draftMessageId: string,
) {
  return (
    draftSessionMessageIds.get(emailAccountId)?.get(draftMessageId) ??
    draftMessageId
  );
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
  const local = drafts.get(draftKey(identity));
  if (local) return local;
  try {
    return await loadEngineReplyDraft(identity);
  } catch {
    return;
  }
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
  const nextContent = {
    ...current.content,
    providerDraftId: draftId,
    providerDraftCreationUnconfirmed: !draftId,
  };
  drafts.set(draftKey(identity), {
    ...current,
    content: nextContent,
  });
  await persistEngineReplyDraft(identity, nextContent).catch(() => {});
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
        await persistEngineReplyDraft(identity, nextContent).catch(() => {});
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
    engineRevisions.clear();
    draftSessionMessageIds.clear();
    for (const accountId of accountEpoch.keys()) {
      accountEpoch.set(accountId, currentEpoch(accountId) + 1);
    }
    return;
  }
  accountEpoch.set(emailAccountId, currentEpoch(emailAccountId) + 1);
  for (const [key, draft] of drafts) {
    if (draft.emailAccountId !== emailAccountId) continue;
    drafts.delete(key);
    engineRevisions.delete(key);
  }
  draftSessionMessageIds.delete(emailAccountId);
}

function draftKey(identity: ReplyDraftIdentity) {
  return JSON.stringify([
    identity.emailAccountId,
    identity.threadId,
    identity.messageId,
  ]);
}

export async function restoreCancelledSendDraft(input: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  operationId: string;
  client?: MailClient | null;
}) {
  const client = input.client ?? getActiveMailClient();
  if (!client) {
    throw new Error(
      "Mail is still starting. Try editing this reply again in a moment.",
    );
  }
  const stored = await client.readDraft({
    accountId: input.emailAccountId,
    draftId: input.operationId,
  });
  if (stored.status !== "found") {
    throw new Error(
      "This reply is no longer on this device. Refresh the thread and try again.",
    );
  }
  try {
    const identity: ReplyDraftIdentity = {
      emailAccountId: input.emailAccountId,
      threadId: input.threadId,
      messageId: getReplyDraftSessionId(input.messageId, "reply"),
    };
    const current = await getReplyDraft(identity);
    await createReplyDraftWriter(identity, current?.revision ?? 0).save({
      composeMode: "reply",
      values: {
        to: stored.content.to.join(", "),
        cc: stored.content.cc.join(", "),
        bcc: stored.content.bcc.join(", "),
        subject: stored.content.subject,
      },
      draft: {
        editableHtml: stored.content.editableHtml,
        mode: "rich",
        quotedHtml: stored.content.quotedHtml,
        signatureHtml: "",
        unsupported: [],
      },
      preservedBlocks: [],
      attachments: [],
    });
  } finally {
    try {
      await releaseSendAttachmentHolds(
        input.emailAccountId,
        stored.content.attachmentIds,
      );
    } catch {
      // TTL remains the backstop for leftover holds.
    }
  }
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

async function persistEngineReplyDraft(
  identity: ReplyDraftIdentity,
  content: ReplyDraftContent | null,
) {
  const client = getActiveMailClient();
  if (!client) return;
  const draftId = engineDraftId(identity);
  if (content == null) {
    const current = await client.readDraft({
      accountId: identity.emailAccountId,
      draftId,
    });
    if (current.status !== "found") return;
    const cleared = await client.saveDraft({
      key: { accountId: identity.emailAccountId, draftId },
      expectedRevision: current.draftRevision,
      content: {
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        editableHtml: "",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    rememberEngineRevision(identity, cleared);
    return;
  }
  let expectedRevision = engineRevisions.get(draftKey(identity)) ?? null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const saved = await client.saveDraft({
      key: { accountId: identity.emailAccountId, draftId },
      expectedRevision,
      content: {
        to: splitRecipientList(content.values.to).slice(0, 100),
        cc: splitRecipientList(content.values.cc ?? "").slice(0, 100),
        bcc: splitRecipientList(content.values.bcc ?? "").slice(0, 100),
        subject: content.values.subject,
        editableHtml: content.draft.editableHtml,
        quotedHtml: content.draft.quotedHtml,
        attachmentIds: [],
        clientState: JSON.stringify(content).slice(0, 1_000_000),
        ...(content.providerDraftId
          ? { providerDraftId: content.providerDraftId }
          : {}),
      },
    });
    if (saved.status !== "conflict") {
      rememberEngineRevision(identity, saved);
      return;
    }
    expectedRevision = saved.currentDraftRevision;
  }
}

async function loadEngineReplyDraft(identity: ReplyDraftIdentity) {
  const client = getActiveMailClient();
  if (!client) return;
  const stored = await client.readDraft({
    accountId: identity.emailAccountId,
    draftId: engineDraftId(identity),
  });
  if (stored.status !== "found" || !stored.content.clientState) return;
  try {
    const content = JSON.parse(stored.content.clientState) as ReplyDraftContent;
    if (!content?.draft || !content.values) return;
    engineRevisions.set(draftKey(identity), stored.draftRevision);
    const restored: StoredReplyDraft = {
      ...identity,
      content,
      revision: stored.draftRevision,
      updatedAt: Date.now(),
    };
    drafts.set(draftKey(identity), restored);
    return restored;
  } catch {
    return;
  }
}

function rememberEngineRevision(
  identity: ReplyDraftIdentity,
  result: DraftSaveResult,
) {
  if (result.status === "saved")
    engineRevisions.set(draftKey(identity), result.draftRevision);
}

function engineDraftId(identity: ReplyDraftIdentity) {
  return identity.messageId.slice(0, 128);
}
