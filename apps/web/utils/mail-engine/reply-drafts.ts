import type {
  DraftContent,
  DraftSaveResult,
} from "@inboxzero/mail-core/drafts";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type {
  EmailAttachmentMetadata,
  PreparedEmailDraft,
} from "@inboxzero/email-editor/core";
import type { EmailEditorPreservedBlock } from "@inboxzero/email-editor/web";
import { splitRecipientList } from "@/utils/email";
import { fetchWithAccount } from "@/utils/fetch";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import type { SendEmailBody } from "@/utils/types/mail";
import { randomUuid } from "@/utils/uuid";

/**
 * A file already on the mailbox draft. Only the reference is stored locally;
 * the mailbox draft holds the bytes.
 */
export type ComposeAttachmentReference = EmailAttachmentMetadata & {
  draftAttachmentId: string;
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
type UnsavedReplyDraft = {
  identity: ReplyDraftIdentity;
  content: ReplyDraftContent;
  updatedAt: number;
  editId: string;
};
type KeptReplyDraft = UnsavedReplyDraft & {
  /** The engine revision this edit was made on; null when it had none. */
  engineRevision: number | null;
};

const drafts = new Map<string, StoredReplyDraft>();
const pendingWrites = new Map<string, Promise<unknown>>();
const engineRevisions = new Map<string, number>();
// Gmail stores every draft save as a new message. Remembering which message a
// draft was first opened from keeps its composer and local draft across saves.
const draftSessionMessageIds = new Map<string, Map<string, string>>();
const latestDraftMessageIds = new Map<string, Map<string, string>>();
const listeners = new Set<(scope: ReplyDraftScope) => void>();
// Drafts other tabs hold aren't loaded here, but their threads still show as
// drafts in this tab's list.
const otherTabDraftThreads = new Map<string, string>();
const PRESENCE_REQUEST = "reply-draft-presence-request";
const TAB_GONE = "reply-draft-tab-gone";
const TAB_ID = randomUuid();
const accountEpoch = new Map<string, number>();
// The engine runs in this page's worker, so a save still on its way there
// dies with the page. Leaving the page keeps those synchronously in
// localStorage, and the next load saves them.
const UNSAVED_DRAFT_KEY_PREFIX = "inbox-zero:unsaved-reply-draft:";
const unsavedWrites = new Map<string, UnsavedReplyDraft>();
const leaveFlushers = new Set<() => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("inbox-zero-reply-drafts")
    : null;

function isReplyDraftSessionId(messageId: string) {
  return messageId.endsWith(":reply") || messageId.endsWith(":forward");
}

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
  ids.delete(draftMessageId);
  return [...ids, draftMessageId];
}

export function getLatestDraftMessageId(
  emailAccountId: string,
  sessionMessageId: string,
) {
  return latestDraftMessageIds.get(emailAccountId)?.get(sessionMessageId);
}

channel?.addEventListener("message", (event) => {
  const scope = event.data;
  // A tab that opens after others started replies asks them for their drafts.
  if (scope?.type === PRESENCE_REQUEST) {
    announceLocalDrafts();
    return;
  }
  // A closing or reloading tab takes its drafts with it; a reload comes back
  // under a new id and announces them again.
  if (scope?.type === TAB_GONE && typeof scope.tabId === "string") {
    for (const [key, thread] of otherTabDraftThreads) {
      if (!key.startsWith(`${scope.tabId}:`)) continue;
      otherTabDraftThreads.delete(key);
      const separator = thread.indexOf(":");
      const removed = {
        emailAccountId: thread.slice(0, separator),
        threadId: thread.slice(separator + 1),
      };
      for (const listener of listeners) listener(removed);
    }
    return;
  }
  if (
    typeof scope?.emailAccountId !== "string" ||
    typeof scope?.threadId !== "string"
  )
    return;
  if (typeof scope.messageId === "string" && typeof scope.tabId === "string") {
    // Two tabs can hold the same draft; one clearing it mustn't drop the other's.
    const key = `${scope.tabId}:${draftKey(scope)}`;
    if (scope.present === true)
      otherTabDraftThreads.set(
        key,
        `${scope.emailAccountId}:${scope.threadId}`,
      );
    else otherTabDraftThreads.delete(key);
  }
  for (const listener of listeners) listener(scope);
});
channel?.postMessage({ type: PRESENCE_REQUEST });
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", (event) => {
    keepUnsavedReplyDrafts();
    // A page kept in the back/forward cache still holds its drafts.
    if (!event.persisted)
      channel?.postMessage({ type: TAB_GONE, tabId: TAB_ID });
  });
  // Mobile browsers can discard a hidden page without a pagehide.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") keepUnsavedReplyDrafts();
  });
}

/**
 * Runs `flush` as the page is hidden or left, just before unsaved drafts are
 * kept for the next load, so the composer's last keystrokes are among them.
 */
export function flushReplyDraftBeforeLeaving(flush: () => void) {
  leaveFlushers.add(flush);
  return () => {
    leaveFlushers.delete(flush);
  };
}

function announceLocalDrafts() {
  for (const draft of drafts.values()) {
    if (draft.content) notifyReplyDraftChange(draft);
  }
}

export function subscribeToReplyDrafts(
  listener: (scope: ReplyDraftScope) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `accountId:threadId` keys of threads with an unsent reply draft in this tab
 * or another, whether or not a provider save has put it in the mailbox yet.
 * Joined with newlines so the value is stable between changes.
 */
export function getReplyDraftThreadKeys() {
  const keys = new Set(otherTabDraftThreads.values());
  for (const draft of drafts.values()) {
    if (draft.content) keys.add(`${draft.emailAccountId}:${draft.threadId}`);
  }
  return [...keys].sort().join("\n");
}

/**
 * Loads the reply drafts this device already holds, so the list marks their
 * threads before they're opened. Drafts already loaded here win.
 */
export async function hydrateReplyDrafts(emailAccountId: string) {
  const client = getActiveMailClient();
  if (!client) return;
  const epoch = currentEpoch(emailAccountId);
  // Registered so that clearing every account also invalidates this read.
  accountEpoch.set(emailAccountId, epoch);
  await Promise.all(
    readKeptReplyDrafts()
      .filter((kept) => kept.identity.emailAccountId === emailAccountId)
      .map(recoverKeptReplyDraft),
  );
  const stored = await client.listDrafts(emailAccountId);
  // A read from a client replaced meanwhile must not win over the new one's.
  if (
    currentEpoch(emailAccountId) !== epoch ||
    getActiveMailClient() !== client
  )
    return;
  for (const { key, draftRevision, content } of stored) {
    const state = parseReplyDraftState(content);
    const threadId =
      content.conversationId ?? state?.content.values.replyToEmail?.threadId;
    // Drafts from before replies and forwards had their own sessions are
    // migrated when their thread opens, not adopted here as a session.
    const messageId = state?.sessionMessageId ?? key.draftId;
    if (!state || !threadId || !isReplyDraftSessionId(messageId)) continue;
    restoreReplyDraft(
      {
        emailAccountId,
        threadId,
        messageId,
      },
      draftRevision,
      state,
    );
  }
}

export async function getReplyDraft(identity: ReplyDraftIdentity) {
  await pendingWrites.get(draftKey(identity))?.catch(() => {});
  assertAccountEpoch(identity.emailAccountId);
  const local = drafts.get(draftKey(identity));
  if (local) return local;
  const kept = readKeptReplyDrafts().find(
    (draft) => draftKey(draft.identity) === draftKey(identity),
  );
  if (kept) await recoverKeptReplyDraft(kept);
  const recovered = drafts.get(draftKey(identity));
  if (recovered) return recovered;
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
    updatedAt: legacy.updatedAt,
  };
  drafts.set(draftKey(identity), migrated);
  drafts.set(draftKey(legacyIdentity), {
    ...legacy,
    content: null,
    revision: legacy.revision + 1,
    updatedAt: Date.now(),
  });
  const persisted = await persistEngineReplyDraft(
    identity,
    migrated.content,
  ).catch(() => false);
  if (persisted)
    await persistEngineReplyDraft(legacyIdentity, null).catch(() => {});
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

/** The mailbox draft was deleted, so the next save starts a new one. */
export async function forgetReplyDraftProvider(
  identity: ReplyDraftIdentity,
  providerDraftId: string,
) {
  await pendingWrites.get(draftKey(identity))?.catch(() => {});
  const current = drafts.get(draftKey(identity));
  if (current?.content?.providerDraftId !== providerDraftId) return;
  const {
    providerDraftId: _draftId,
    providerDraftCreationUnconfirmed: _unconfirmed,
    providerDraftMessageIds: _messageIds,
    ...content
  } = current.content;
  drafts.set(draftKey(identity), { ...current, content });
  await persistEngineReplyDraft(identity, content).catch(() => {});
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

export async function getReplyDrafts(
  emailAccountId: string,
  threadId: string,
  messageIds?: string[],
) {
  assertAccountEpoch(emailAccountId);
  const sessionIds = new Set(
    (messageIds ?? []).flatMap((messageId) => [
      getReplyDraftSessionId(messageId, "reply"),
      getReplyDraftSessionId(messageId, "forward"),
    ]),
  );
  await Promise.all(
    (messageIds ?? []).map(async (messageId) => {
      const legacyIdentity = { emailAccountId, threadId, messageId };
      for (const mode of ["reply", "forward"] as const) {
        await getReplyDraftForSession(
          {
            ...legacyIdentity,
            messageId: getReplyDraftSessionId(messageId, mode),
          },
          legacyIdentity,
          mode,
        );
      }
    }),
  );
  return [...drafts.values()].filter(
    (draft) =>
      draft.emailAccountId === emailAccountId &&
      draft.threadId === threadId &&
      draft.content !== null &&
      (!messageIds || sessionIds.has(draft.messageId)),
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
    const updatedAt = Date.now();
    const unsaved: UnsavedReplyDraft | undefined = content
      ? {
          identity: pickIdentity(identity),
          content,
          updatedAt,
          editId: randomUuid(),
        }
      : undefined;
    if (unsaved) unsavedWrites.set(draftKey(identity), unsaved);
    else {
      // A discard isn't kept: replaying it could erase another tab's edits.
      // Nor is the edit it discards, which may not have reached the engine.
      unsavedWrites.delete(draftKey(identity));
      forgetKeptReplyDraft(identity);
    }
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
        const nextContent =
          content && withProviderReferences(content, previous?.content);
        drafts.set(draftKey(identity), {
          ...identity,
          content: nextContent,
          revision: revision + 1,
          updatedAt,
        });
        revision += 1;
        // The list marks the thread as a draft from this change, so it
        // mustn't wait on the local save.
        if (Boolean(previous?.content) !== Boolean(content)) {
          notifyReplyDraftChange(identity);
        }
        const persisted = await persistEngineReplyDraft(
          identity,
          nextContent,
        ).catch(() => false);
        if (persisted && unsaved) forgetUnsavedReplyDraft(unsaved);
      });
    // A write refused for a conflict or a cleared account isn't the user's
    // latest copy to bring back.
    if (unsaved) operation.catch(() => forgetUnsavedReplyDraft(unsaved));
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

export function clearLocalReplyDrafts(emailAccountId?: string) {
  if (!emailAccountId) {
    drafts.clear();
    otherTabDraftThreads.clear();
    engineRevisions.clear();
    draftSessionMessageIds.clear();
    latestDraftMessageIds.clear();
    for (const accountId of accountEpoch.keys()) {
      accountEpoch.set(accountId, currentEpoch(accountId) + 1);
    }
    forgetUnsavedReplyDrafts();
    return;
  }
  accountEpoch.set(emailAccountId, currentEpoch(emailAccountId) + 1);
  forgetUnsavedReplyDrafts(emailAccountId);
  for (const [key, draft] of drafts) {
    if (draft.emailAccountId !== emailAccountId) continue;
    drafts.delete(key);
    engineRevisions.delete(key);
  }
  draftSessionMessageIds.delete(emailAccountId);
  latestDraftMessageIds.delete(emailAccountId);
  for (const [key, thread] of otherTabDraftThreads) {
    if (thread.startsWith(`${emailAccountId}:`))
      otherTabDraftThreads.delete(key);
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
  const identity: ReplyDraftIdentity = {
    emailAccountId: input.emailAccountId,
    threadId: input.threadId,
    messageId: getReplyDraftSessionId(input.messageId, "reply"),
  };
  const current = await getReplyDraft(identity);
  await createReplyDraftWriter(identity, current?.revision ?? 0).save({
    composeMode: "reply",
    values: {
      ...(stored.content.from ? { from: stored.content.from } : {}),
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
    // The mailbox draft still holds the files; these only list them.
    attachments: sentAttachments(stored.content.clientState),
    ...(stored.content.providerDraftId
      ? { providerDraftId: stored.content.providerDraftId }
      : {}),
    ...(stored.content.providerDraftMessageIds
      ? { providerDraftMessageIds: stored.content.providerDraftMessageIds }
      : {}),
  });
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

function notifyReplyDraftChange(identity: ReplyDraftIdentity) {
  const scope = {
    emailAccountId: identity.emailAccountId,
    threadId: identity.threadId,
  };
  for (const listener of listeners) listener(scope);
  // Only the identity: callers may pass a whole stored draft, whose content
  // other tabs don't need.
  channel?.postMessage({
    ...scope,
    messageId: identity.messageId,
    tabId: TAB_ID,
    present: Boolean(drafts.get(draftKey(identity))?.content),
  });
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
  if (!client) return false;
  const draftId = engineDraftId(identity);
  if (content == null) {
    const current = await client.readDraft({
      accountId: identity.emailAccountId,
      draftId,
    });
    if (current.status !== "found") return false;
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
      },
    });
    rememberEngineRevision(identity, cleared);
    return cleared.status === "saved";
  }
  let expectedRevision = engineRevisions.get(draftKey(identity)) ?? null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const saved = await client.saveDraft({
      key: { accountId: identity.emailAccountId, draftId },
      expectedRevision,
      content: engineDraftContent(
        identity,
        content,
        drafts.get(draftKey(identity))?.updatedAt,
      ),
    });
    if (saved.status !== "conflict") {
      rememberEngineRevision(identity, saved);
      return saved.status === "saved";
    }
    expectedRevision = saved.currentDraftRevision;
  }
  return false;
}

async function loadEngineReplyDraft(identity: ReplyDraftIdentity) {
  const client = getActiveMailClient();
  if (!client) return;
  const epoch = currentEpoch(identity.emailAccountId);
  // Registered so that clearing every account also invalidates this read.
  accountEpoch.set(identity.emailAccountId, epoch);
  const stored = await client.readDraft({
    accountId: identity.emailAccountId,
    draftId: engineDraftId(identity),
  });
  if (stored.status !== "found") return;
  // The account may have been cleared, or a composer may have saved, while
  // the read was in flight.
  if (currentEpoch(identity.emailAccountId) !== epoch) return;
  const state = parseReplyDraftState(stored.content);
  if (!state) return;
  return restoreReplyDraft(identity, stored.draftRevision, state);
}

function restoreReplyDraft(
  identity: ReplyDraftIdentity,
  revision: number,
  state: NonNullable<ReturnType<typeof parseReplyDraftState>>,
) {
  const current = drafts.get(draftKey(identity));
  if (current) return current;
  engineRevisions.set(draftKey(identity), revision);
  const restored: StoredReplyDraft = {
    ...identity,
    content: state.content,
    revision,
    updatedAt: state.updatedAt,
  };
  drafts.set(draftKey(identity), restored);
  notifyReplyDraftChange(identity);
  return restored;
}

/** Null for anything that isn't a reply draft: a cleared one or a send's. */
function parseReplyDraftState(stored: DraftContent) {
  if (!stored.clientState) return null;
  try {
    const { updatedAt, sessionMessageId, ...content } = JSON.parse(
      stored.clientState,
    ) as ReplyDraftContent & { updatedAt?: number; sessionMessageId?: string };
    if (!content?.draft || !content.values) return null;
    return {
      content,
      sessionMessageId:
        typeof sessionMessageId === "string" ? sessionMessageId : undefined,
      // Older persisted drafts have no edit time; reading them isn't an edit.
      updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
    };
  } catch {
    return null;
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

function sentAttachments(clientState: string | undefined) {
  if (!clientState) return [];
  try {
    const parsed = JSON.parse(clientState) as {
      attachments?: ComposeAttachmentReference[];
    };
    return Array.isArray(parsed.attachments) ? parsed.attachments : [];
  } catch {
    return [];
  }
}

function pickIdentity(identity: ReplyDraftIdentity): ReplyDraftIdentity {
  return {
    emailAccountId: identity.emailAccountId,
    threadId: identity.threadId,
    messageId: identity.messageId,
  };
}

function engineDraftContent(
  identity: ReplyDraftIdentity,
  content: ReplyDraftContent,
  updatedAt: number | undefined,
): DraftContent {
  return {
    to: splitRecipientList(content.values.to).slice(0, 100),
    cc: splitRecipientList(content.values.cc ?? "").slice(0, 100),
    bcc: splitRecipientList(content.values.bcc ?? "").slice(0, 100),
    subject: content.values.subject,
    editableHtml: content.draft.editableHtml,
    quotedHtml: content.draft.quotedHtml,
    // Lets startup mark the thread as a draft before it's opened.
    conversationId: identity.threadId,
    clientState: JSON.stringify({
      ...content,
      updatedAt,
      // The engine's draft id is cut to 128 characters, so startup reads
      // the full session id from here.
      sessionMessageId: identity.messageId,
    }).slice(0, 1_000_000),
    ...(content.providerDraftId
      ? { providerDraftId: content.providerDraftId }
      : {}),
  };
}

function keepUnsavedReplyDrafts() {
  for (const flush of leaveFlushers) flush();
  for (const [key, unsaved] of unsavedWrites) {
    const storageKey = `${UNSAVED_DRAFT_KEY_PREFIX}${key}`;
    // Another tab may have kept a later edit of the same draft.
    if ((readKeptReplyDraft(storageKey)?.updatedAt ?? 0) > unsaved.updatedAt)
      continue;
    const kept: KeptReplyDraft = {
      ...unsaved,
      // The edit may not have reached the writer, which would add these.
      content: withProviderReferences(
        unsaved.content,
        drafts.get(key)?.content,
      ),
      engineRevision: engineRevisions.get(key) ?? null,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(kept));
    } catch {}
  }
}

/**
 * Saves a draft kept from a previous page onto the engine revision it was
 * made on. If the engine has moved on, the kept edit still wins over an older
 * or equally recent one, such as this tab's earlier save that landed after
 * all, but never over a newer edit or a discard.
 */
async function recoverKeptReplyDraft(kept: KeptReplyDraft) {
  const client = getActiveMailClient();
  // A draft already open here is what the user is editing now; its next
  // save supersedes the kept copy.
  if (!client || drafts.has(draftKey(kept.identity))) return;
  const { identity } = kept;
  const key = {
    accountId: identity.emailAccountId,
    draftId: engineDraftId(identity),
  };
  const epoch = currentEpoch(identity.emailAccountId);
  let expectedRevision = kept.engineRevision;
  let saved: DraftSaveResult;
  try {
    for (let attempt = 0; ; attempt += 1) {
      saved = await client.saveDraft({
        key,
        expectedRevision,
        content: engineDraftContent(identity, kept.content, kept.updatedAt),
      });
      if (saved.status !== "conflict" || attempt > 0) break;
      const current = await client.readDraft(key);
      if (current.status !== "found") break;
      const state = parseReplyDraftState(current.content);
      // An edit made in the same millisecond is no newer, and the kept one
      // came last from its page.
      if (!state || state.updatedAt > kept.updatedAt) break;
      expectedRevision = current.draftRevision;
    }
  } catch {
    return;
  }
  // A rejected save leaves the copy for a later load to try again.
  if (saved.status !== "saved" && saved.status !== "conflict") return;
  forgetKeptReplyDraft(identity, kept.editId);
  if (
    saved.status !== "saved" ||
    currentEpoch(identity.emailAccountId) !== epoch
  )
    return;
  restoreReplyDraft(identity, saved.draftRevision, {
    content: kept.content,
    sessionMessageId: identity.messageId,
    updatedAt: kept.updatedAt,
  });
}

function readKeptReplyDrafts() {
  const kept: KeptReplyDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(UNSAVED_DRAFT_KEY_PREFIX)) continue;
      const draft = readKeptReplyDraft(key);
      if (draft) kept.push(draft);
    }
  } catch {}
  return kept;
}

function readKeptReplyDraft(storageKey: string) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    ) as KeptReplyDraft | null;
    if (
      typeof parsed?.identity?.emailAccountId === "string" &&
      typeof parsed.identity.threadId === "string" &&
      typeof parsed.identity.messageId === "string" &&
      typeof parsed.updatedAt === "number" &&
      typeof parsed.editId === "string" &&
      parsed.content?.draft &&
      parsed.content.values &&
      (parsed.engineRevision === null ||
        typeof parsed.engineRevision === "number")
    )
      return parsed;
  } catch {}
}

function forgetUnsavedReplyDraft(unsaved: UnsavedReplyDraft) {
  const key = draftKey(unsaved.identity);
  if (unsavedWrites.get(key) === unsaved) unsavedWrites.delete(key);
  const kept = readKeptReplyDraft(`${UNSAVED_DRAFT_KEY_PREFIX}${key}`);
  // A later edit made in the same millisecond keeps its copy.
  if (
    kept &&
    (kept.editId === unsaved.editId || kept.updatedAt < unsaved.updatedAt)
  )
    forgetKeptReplyDraft(unsaved.identity);
}

/** With `editId`, only that edit's copy: another tab may have kept a later one. */
function forgetKeptReplyDraft(identity: ReplyDraftIdentity, editId?: string) {
  const storageKey = `${UNSAVED_DRAFT_KEY_PREFIX}${draftKey(identity)}`;
  if (editId && readKeptReplyDraft(storageKey)?.editId !== editId) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {}
}

function forgetUnsavedReplyDrafts(emailAccountId?: string) {
  for (const [key, unsaved] of unsavedWrites) {
    if (!emailAccountId || unsaved.identity.emailAccountId === emailAccountId)
      unsavedWrites.delete(key);
  }
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(UNSAVED_DRAFT_KEY_PREFIX)) continue;
      const kept = readKeptReplyDraft(key);
      // Unreadable copies go too; there's nothing left to recover from them.
      if (
        !emailAccountId ||
        !kept ||
        kept.identity.emailAccountId === emailAccountId
      )
        localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * A composer saves only what the user wrote; the mailbox draft it was saved
 * as carries over from the draft's previous content.
 */
function withProviderReferences(
  content: ReplyDraftContent,
  previous: ReplyDraftContent | null | undefined,
): ReplyDraftContent {
  let next = content;
  if (previous && previous.requestId === content.requestId) {
    next = {
      ...content,
      ...(previous.providerDraftId && {
        providerDraftId: previous.providerDraftId,
      }),
      ...(previous.providerDraftCreationUnconfirmed !== undefined && {
        providerDraftCreationUnconfirmed:
          previous.providerDraftCreationUnconfirmed,
      }),
    };
  }
  // The composer doesn't track the mailbox copies of its draft; they belong
  // to the mailbox draft, whichever composer session saves.
  const providerDraftId = next.providerDraftId ?? previous?.providerDraftId;
  if (
    providerDraftId &&
    previous?.providerDraftId === providerDraftId &&
    previous.providerDraftMessageIds
  )
    next = {
      ...next,
      providerDraftMessageIds: previous.providerDraftMessageIds,
    };
  return next;
}
