import type { DraftSaveResult } from "@inboxzero/mail-core/drafts";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type {
  EmailAttachmentMetadata,
  PreparedEmailDraft,
} from "@inboxzero/email-editor/core";
import type { EmailEditorPreservedBlock } from "@inboxzero/email-editor/web";
import { splitRecipientList } from "@/utils/email";
import { fetchWithAccount } from "@/utils/fetch";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import { releaseSendAttachmentHolds } from "@/utils/mail-engine/stage-attachments";
import type { SendEmailBody } from "@/utils/types/mail";

/**
 * A file already on the mailbox draft. Only the reference is stored locally;
 * the mailbox draft holds the bytes.
 */
export type ComposeAttachmentReference = EmailAttachmentMetadata & {
  providerAttachmentId: string;
};

export type ReplyDraftContent = {
  providerDraftId?: string;
  providerDraftCreationUnconfirmed?: boolean;
  /**
   * Mailbox messages this composer saved its draft as. The thread hides them
   * so the open composer is the only place the draft shows.
   */
  providerDraftMessageIds?: string[];
  composeMode?: ReplyDraftMode;
  requestId?: string;
  deliveryPath?: "scheduled" | "outbox";
  values: Omit<SendEmailBody, "attachments" | "messageHtml">;
  draft: PreparedEmailDraft;
  preservedBlocks: EmailEditorPreservedBlock[];
  attachments: ComposeAttachmentReference[];
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
const latestDraftMessageIds = new Map<string, Map<string, string>>();
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
  accountMap(draftSessionMessageIds, emailAccountId).set(
    nextMessageId,
    sessionMessageId,
  );
  accountMap(latestDraftMessageIds, emailAccountId).set(
    sessionMessageId,
    nextMessageId,
  );
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

/** Every mailbox message a draft has been saved as while it was open here. */
export function getDraftSessionMessageIds(
  emailAccountId: string,
  draftMessageId: string,
) {
  const sessionMessageId = getDraftSessionMessageId(
    emailAccountId,
    draftMessageId,
  );
  const ids = new Set([sessionMessageId, draftMessageId]);
  for (const [messageId, session] of draftSessionMessageIds.get(
    emailAccountId,
  ) ?? []) {
    if (session === sessionMessageId) ids.add(messageId);
  }
  return [...ids];
}

export function getLatestDraftMessageId(
  emailAccountId: string,
  sessionMessageId: string,
) {
  return latestDraftMessageIds.get(emailAccountId)?.get(sessionMessageId);
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

export async function rememberProviderDraftMessage(
  identity: ReplyDraftIdentity,
  requestId: string,
  messageId: string,
) {
  await pendingWrites.get(draftKey(identity))?.catch(() => {});
  assertAccountEpoch(identity.emailAccountId);
  const current = drafts.get(draftKey(identity));
  if (!current?.content || current.content.requestId !== requestId) return;
  const messageIds = current.content.providerDraftMessageIds ?? [];
  if (messageIds.includes(messageId)) return;
  const nextContent = {
    ...current.content,
    providerDraftMessageIds: [...messageIds, messageId].slice(-50),
  };
  drafts.set(draftKey(identity), { ...current, content: nextContent });
  await persistEngineReplyDraft(identity, nextContent).catch(() => {});
  notifyReplyDraftChange(identity);
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
            ...(previous.content.providerDraftMessageIds && {
              providerDraftMessageIds: previous.content.providerDraftMessageIds,
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

/**
 * Once a draft reaches the mailbox the mailbox owns it, so deleting it there
 * must not leave the composer reopening this copy. Only a definite "gone"
 * discards it; an unreachable mailbox keeps what the user wrote.
 */
export async function dropReplyDraftDeletedFromMailbox(
  draft: StoredReplyDraft | undefined,
) {
  const providerDraftId = draft?.content?.providerDraftId;
  if (!draft || !providerDraftId) return draft;
  const client = getActiveMailClient();
  const key = draftKey(draft);
  const engineRevision = engineRevisions.get(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetchWithAccount({
      url: `/api/user/drafts/${encodeURIComponent(providerDraftId)}`,
      emailAccountId: draft.emailAccountId,
      init: { cache: "no-store", signal: controller.signal },
    });
    if (response.status !== 404) return draft;
    const body = (await response.json()) as { code?: string };
    if (body.code !== "DRAFT_NOT_FOUND") return draft;
  } catch {
    return draft;
  } finally {
    clearTimeout(timeout);
  }
  await pendingWrites.get(key)?.catch(() => {});
  if (drafts.get(key) !== draft) return getReplyDraft(draft);
  if (client !== getActiveMailClient()) return draft;
  if (client) {
    if (engineRevision === undefined) return draft;
    try {
      // A fresh revision read here could authorize clearing another client's edits.
      const cleared = await client.saveDraft({
        key: { accountId: draft.emailAccountId, draftId: engineDraftId(draft) },
        expectedRevision: engineRevision,
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
      if (drafts.get(key) !== draft) return getReplyDraft(draft);
      if (cleared.status === "conflict") {
        drafts.delete(key);
        engineRevisions.delete(key);
        return getReplyDraft(draft);
      }
      if (cleared.status !== "saved") return draft;
      rememberEngineRevision(draft, cleared);
    } catch {
      return draft;
    }
    drafts.set(key, {
      ...draft,
      content: null,
      revision: draft.revision + 1,
      updatedAt: Date.now(),
    });
    notifyReplyDraftChange(draft);
  } else {
    await createReplyDraftWriter(draft, draft.revision)
      .clear()
      .catch(() => {});
  }
  // Hand back whatever the store holds now so the composer writes at its
  // revision instead of restarting from zero and rejecting its own saves.
  return getReplyDraft(draft);
}

/**
 * A scheduled reply sends its mailbox draft later, after the composer and its
 * local draft are gone. Its saved copy stays hidden in the thread until then.
 */
export function hideScheduledDraftMessages(
  emailAccountId: string,
  messageIds: string[],
  hiddenUntil: number,
) {
  if (!messageIds.length) return;
  const hidden = readScheduledDraftMessages();
  hidden[emailAccountId] = {
    ...hidden[emailAccountId],
    ...Object.fromEntries(messageIds.map((id) => [id, hiddenUntil])),
  };
  writeScheduledDraftMessages(hidden);
}

export function getScheduledDraftMessageIds(emailAccountId: string) {
  const now = Date.now();
  return Object.entries(readScheduledDraftMessages()[emailAccountId] ?? {})
    .filter(([, hiddenUntil]) => hiddenUntil > now)
    .map(([messageId]) => messageId);
}

export function clearLocalReplyDrafts(emailAccountId?: string) {
  const scheduled = readScheduledDraftMessages();
  if (emailAccountId) delete scheduled[emailAccountId];
  writeScheduledDraftMessages(emailAccountId ? scheduled : {});
  if (!emailAccountId) {
    drafts.clear();
    engineRevisions.clear();
    draftSessionMessageIds.clear();
    latestDraftMessageIds.clear();
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
  latestDraftMessageIds.delete(emailAccountId);
}

const SCHEDULED_DRAFT_MESSAGES_KEY = "inbox-zero-scheduled-draft-messages";

function readScheduledDraftMessages(): Record<string, Record<string, number>> {
  try {
    return JSON.parse(
      localStorage.getItem(SCHEDULED_DRAFT_MESSAGES_KEY) ?? "{}",
    );
  } catch {
    return {};
  }
}

function writeScheduledDraftMessages(
  hidden: Record<string, Record<string, number>>,
) {
  try {
    const now = Date.now();
    const pruned = Object.fromEntries(
      Object.entries(hidden).map(([account, messages]) => [
        account,
        Object.fromEntries(
          Object.entries(messages).filter(([, until]) => until > now),
        ),
      ]),
    );
    localStorage.setItem(SCHEDULED_DRAFT_MESSAGES_KEY, JSON.stringify(pruned));
  } catch {
    // Storage unavailable: the draft shows in the thread until it's sent.
  }
}

function accountMap(
  maps: Map<string, Map<string, string>>,
  emailAccountId: string,
) {
  let map = maps.get(emailAccountId);
  if (!map) {
    map = new Map();
    maps.set(emailAccountId, map);
  }
  return map;
}

function draftKey(identity: ReplyDraftIdentity) {
  return JSON.stringify([
    identity.emailAccountId,
    identity.threadId,
    identity.messageId,
  ]);
}

export async function restoreUnsentReplyDraft(input: {
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
        mode: "original",
        quotedHtml: stored.content.quotedHtml,
        signatureHtml: "",
      },
      preservedBlocks: [],
      // The mailbox draft still holds the files; the composer lists them from
      // there when it reopens.
      attachments: [],
      ...(stored.content.providerDraftId
        ? { providerDraftId: stored.content.providerDraftId }
        : {}),
      ...(stored.content.providerDraftMessageIds
        ? { providerDraftMessageIds: stored.content.providerDraftMessageIds }
        : {}),
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
