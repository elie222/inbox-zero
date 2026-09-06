import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReplyDraftContent } from "./reply-drafts";
import type { ParsedMessage } from "@/utils/types";

const DATABASE_NAME = "inbox-zero-email-cache";
const DATABASE_VERSION = 5;

export type CachedThreadRow = {
  emailAccountId: string;
  threadId: string;
  data: unknown;
  fetchedAt: number;
  lastAccessedAt: number;
};

export type CachedThreadView = {
  emailAccountId: string;
  viewKey: string;
  threadIds: string[];
  hasMore: boolean;
  fetchedAt: number;
  lastAccessedAt: number;
};

export type CachedThreadDetail = {
  emailAccountId: string;
  threadId: string;
  variant: string;
  data: unknown;
  fetchedAt: number;
  lastAccessedAt: number;
  byteSize: number;
};

export type CachedMailboxMessage = {
  emailAccountId: string;
  messageId: string;
  threadId: string;
  data: ParsedMessage;
  receivedAt: number;
  lastAccessedAt: number;
};

export type CachedMailboxSyncState = {
  emailAccountId: string;
  cursor: string;
  after: string;
  hasMore: boolean;
  lastSyncedAt: number;
  completedAt?: number;
};

export type MailMutationClientSource = {
  kind: "sender";
  sender: string;
};

export type StoredMailMutation = {
  id: string;
  batchId: string;
  emailAccountId: string;
  threadId: string;
  messageIds: string[];
  clientSource?: MailMutationClientSource;
  kind:
    | "archive"
    | "unarchive"
    | "trash"
    | "untrash"
    | "spam"
    | "set_read_state"
    | "snooze"
    | "cancel_snooze"
    | "reply";
  payload: unknown;
  status:
    | "pending"
    | "processing"
    | "retry_wait"
    | "blocked_auth"
    | "awaiting_sync"
    | "reconciling"
    | "succeeded"
    | "failed"
    | "uncertain";
  attempts: number;
  syncAttempts?: number;
  nextAttemptAt: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  notificationShownAt?: number;
  result?: unknown;
};

export type StoredReplyDraft = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  revision: number;
  content: ReplyDraftContent | null;
  updatedAt: number;
};

interface EmailCacheSchema extends DBSchema {
  mailboxMessages: {
    key: [emailAccountId: string, messageId: string];
    value: CachedMailboxMessage;
    indexes: {
      byAccount: string;
      byAccountReceivedAt: [emailAccountId: string, receivedAt: number];
      byAccountThread: [emailAccountId: string, threadId: string];
      byReceivedAt: number;
    };
  };
  mailboxSyncStates: {
    key: string;
    value: CachedMailboxSyncState;
  };
  mailMutations: {
    key: string;
    value: StoredMailMutation;
    indexes: {
      byAccount: string;
      byAccountThread: [emailAccountId: string, threadId: string];
      byBatch: string;
      byNextAttempt: [status: string, nextAttemptAt: number];
      byUpdatedAt: number;
    };
  };
  replyDrafts: {
    key: [emailAccountId: string, threadId: string, messageId: string];
    value: StoredReplyDraft;
    indexes: { byAccount: string; byAccountThread: [string, string] };
  };
  threadDetails: {
    key: [emailAccountId: string, threadId: string, variant: string];
    value: CachedThreadDetail;
    indexes: { byAccount: string; byLastAccessed: number };
  };
  threadRows: {
    key: [emailAccountId: string, threadId: string];
    value: CachedThreadRow;
    indexes: { byAccount: string };
  };
  threadViews: {
    key: [emailAccountId: string, viewKey: string];
    value: CachedThreadView;
    indexes: { byAccount: string; byLastAccessed: number };
  };
}

let databasePromise: Promise<
  IDBPDatabase<EmailCacheSchema> | undefined
> | null = null;
let cacheEpoch = 0;
const accountEpochs = new Map<string, number>();
let cacheInvalidationCount = 0;
const accountInvalidationCounts = new Map<string, number>();

type EmailCacheEpoch = readonly [cache: number, account: number];

export function getEmailCacheDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  if (databasePromise) return databasePromise;

  databasePromise = openDB<EmailCacheSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const rows = database.createObjectStore("threadRows", {
          keyPath: ["emailAccountId", "threadId"],
        });
        rows.createIndex("byAccount", "emailAccountId");

        const views = database.createObjectStore("threadViews", {
          keyPath: ["emailAccountId", "viewKey"],
        });
        views.createIndex("byAccount", "emailAccountId");
        views.createIndex("byLastAccessed", "lastAccessedAt");

        const details = database.createObjectStore("threadDetails", {
          keyPath: ["emailAccountId", "threadId", "variant"],
        });
        details.createIndex("byAccount", "emailAccountId");
        details.createIndex("byLastAccessed", "lastAccessedAt");
      }

      if (oldVersion < 2) {
        const messages = database.createObjectStore("mailboxMessages", {
          keyPath: ["emailAccountId", "messageId"],
        });
        messages.createIndex("byAccount", "emailAccountId");
        messages.createIndex("byAccountReceivedAt", [
          "emailAccountId",
          "receivedAt",
        ]);
        messages.createIndex("byAccountThread", ["emailAccountId", "threadId"]);
        messages.createIndex("byReceivedAt", "receivedAt");

        database.createObjectStore("mailboxSyncStates", {
          keyPath: "emailAccountId",
        });
      } else if (oldVersion < 3) {
        transaction
          .objectStore("mailboxMessages")
          .createIndex("byAccountReceivedAt", ["emailAccountId", "receivedAt"]);
      }

      if (oldVersion < 5) {
        const drafts = database.createObjectStore("replyDrafts", {
          keyPath: ["emailAccountId", "threadId", "messageId"],
        });
        drafts.createIndex("byAccount", "emailAccountId");
        drafts.createIndex("byAccountThread", ["emailAccountId", "threadId"]);
      }

      if (oldVersion < 4) {
        const mutations = database.createObjectStore("mailMutations", {
          keyPath: "id",
        });
        mutations.createIndex("byAccount", "emailAccountId");
        mutations.createIndex("byAccountThread", [
          "emailAccountId",
          "threadId",
        ]);
        mutations.createIndex("byBatch", "batchId");
        mutations.createIndex("byNextAttempt", ["status", "nextAttemptAt"]);
        mutations.createIndex("byUpdatedAt", "updatedAt");
      }
    },
    blocking() {
      databasePromise?.then((database) => database?.close());
      databasePromise = null;
    },
    terminated() {
      databasePromise = null;
    },
  }).catch<undefined>(() => {
    databasePromise = null;
  });

  return databasePromise;
}

export function captureEmailCacheEpoch(
  emailAccountId: string,
): EmailCacheEpoch | undefined {
  if (isCacheInvalidationActive(emailAccountId)) return;
  return [cacheEpoch, accountEpochs.get(emailAccountId) ?? 0];
}

export function isEmailCacheEpochCurrent(
  emailAccountId: string,
  epoch: EmailCacheEpoch | undefined,
) {
  if (!epoch || isCacheInvalidationActive(emailAccountId)) return false;
  const [capturedCacheEpoch, capturedAccountEpoch] = epoch;
  return (
    capturedCacheEpoch === cacheEpoch &&
    capturedAccountEpoch === (accountEpochs.get(emailAccountId) ?? 0)
  );
}

export async function clearEmailCache() {
  cacheInvalidationCount += 1;
  cacheEpoch += 1;
  accountEpochs.clear();

  try {
    const database = await getEmailCacheDatabase();
    if (!database) return;
    const transaction = database.transaction(
      [
        "threadRows",
        "threadViews",
        "threadDetails",
        "mailboxMessages",
        "mailboxSyncStates",
        "mailMutations",
        "replyDrafts",
      ],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("threadRows").clear(),
      transaction.objectStore("threadViews").clear(),
      transaction.objectStore("threadDetails").clear(),
      transaction.objectStore("mailboxMessages").clear(),
      transaction.objectStore("mailboxSyncStates").clear(),
      transaction.objectStore("mailMutations").clear(),
      transaction.objectStore("replyDrafts").clear(),
      transaction.done,
    ]);
  } catch {
    // Browser storage is a performance enhancement; clearing it must not block logout.
  } finally {
    cacheInvalidationCount -= 1;
  }
}

export async function clearEmailCacheForAccount(emailAccountId: string) {
  accountInvalidationCounts.set(
    emailAccountId,
    (accountInvalidationCounts.get(emailAccountId) ?? 0) + 1,
  );
  accountEpochs.set(
    emailAccountId,
    (accountEpochs.get(emailAccountId) ?? 0) + 1,
  );

  try {
    const database = await getEmailCacheDatabase();
    if (!database) return;
    const transaction = database.transaction(
      [
        "threadRows",
        "threadViews",
        "threadDetails",
        "mailboxMessages",
        "mailboxSyncStates",
        "mailMutations",
        "replyDrafts",
      ],
      "readwrite",
    );
    const rows = transaction.objectStore("threadRows");
    const views = transaction.objectStore("threadViews");
    const details = transaction.objectStore("threadDetails");
    const messages = transaction.objectStore("mailboxMessages");
    const mutations = transaction.objectStore("mailMutations");
    const drafts = transaction.objectStore("replyDrafts");
    const [
      rowKeys,
      viewKeys,
      detailKeys,
      messageKeys,
      mutationKeys,
      draftKeys,
    ] = await Promise.all([
      rows.index("byAccount").getAllKeys(emailAccountId),
      views.index("byAccount").getAllKeys(emailAccountId),
      details.index("byAccount").getAllKeys(emailAccountId),
      messages.index("byAccount").getAllKeys(emailAccountId),
      mutations.index("byAccount").getAllKeys(emailAccountId),
      drafts.index("byAccount").getAllKeys(emailAccountId),
    ]);
    await Promise.all([
      ...rowKeys.map((key) => rows.delete(key)),
      ...viewKeys.map((key) => views.delete(key)),
      ...detailKeys.map((key) => details.delete(key)),
      ...messageKeys.map((key) => messages.delete(key)),
      ...mutationKeys.map((key) => mutations.delete(key)),
      ...draftKeys.map((key) => drafts.delete(key)),
      transaction.objectStore("mailboxSyncStates").delete(emailAccountId),
    ]);
    await transaction.done;
  } catch {
    // An unavailable cache must never prevent an account from disconnecting.
  } finally {
    const remainingInvalidations =
      (accountInvalidationCounts.get(emailAccountId) ?? 1) - 1;
    if (remainingInvalidations > 0) {
      accountInvalidationCounts.set(emailAccountId, remainingInvalidations);
    } else {
      accountInvalidationCounts.delete(emailAccountId);
    }
  }
}

function isCacheInvalidationActive(emailAccountId: string) {
  return (
    cacheInvalidationCount > 0 ||
    (accountInvalidationCounts.get(emailAccountId) ?? 0) > 0
  );
}
