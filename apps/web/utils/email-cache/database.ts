import { cleanupSearchIndex } from "./search-index-service";
import type {
  LocalMailSyncState,
  LocalMailSyncJob,
  LocalMailSyncSeen,
} from "./local-mail-sync-state";
import { notifyEmailCacheChange } from "./cache-events";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReplyDraftContent } from "./reply-drafts";
import type { ParsedMessage } from "@/utils/types";
import { clearMailActivation } from "./mail-activation";
import { randomUuid } from "@/utils/uuid";

const DATABASE_NAME = "inbox-zero-email-cache";
const DATABASE_VERSION = 14;

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

type MailboxSyncJob = {
  emailAccountId: string;
  leaseToken?: string;
  leaseExpiresAt: number;
  retryAt: number;
  nextPollAt: number;
  failures: number;
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
    | "set_starred_state"
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

export interface EmailCacheSchema extends DBSchema {
  localMailMessages: {
    key: [emailAccountId: string, messageId: string];
    value: {
      emailAccountId: string;
      messageId: string;
      threadId: string;
      data: ParsedMessage;
      fetchedAt: number;
      bodyFetchedAt?: number;
      receivedAt: number;
      lastAccessedAt: number;
      byteSize: number;
    };
    indexes: {
      byAccount: string;
      byAccountThreadMessage: [string, string, string];
      byAccountReceivedAt: [string, number];
    };
  };
  localMailSyncJobs: {
    key: [string, string];
    value: LocalMailSyncJob;
    indexes: { byAccount: string; byAccountPriority: [string, number, number] };
  };
  localMailSyncSeen: {
    key: [string, string, string];
    value: LocalMailSyncSeen;
  };
  localMailSyncStates: { key: string; value: LocalMailSyncState };
  localMailTombstones: {
    key: [emailAccountId: string, messageId: string];
    value: {
      emailAccountId: string;
      messageId: string;
      deletedAt: number;
    };
  };
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
  mailboxSyncJobs: {
    key: string;
    value: MailboxSyncJob;
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
      byAccountDiagnostics: [
        string,
        string,
        number,
        StoredMailMutation["status"],
        string,
        string[],
      ];
    };
  };
  replyDrafts: {
    key: [emailAccountId: string, threadId: string, messageId: string];
    value: StoredReplyDraft;
    indexes: { byAccount: string; byAccountThread: [string, string] };
  };
  searchIndexAccounts: {
    key: string;
    value: {
      emailAccountId: string;
      generation: string;
      sourceVersion?: number;
      messageBytes?: number;
      seed?: {
        store: "mailboxMessages" | "threadRows" | "threadDetails";
        after?: [string, string] | [string, string, string];
        messageOffset?: number;
      };
    };
  };
  searchIndexWork: {
    key: [emailAccountId: string, threadId: string];
    value: {
      emailAccountId: string;
      threadId: string;
      token: string;
      status: "pending" | "blocked";
      errorCode?: string;
      afterMessageId?: string;
    };
    indexes: { byAccount: string; byAccountStatus: [string, string] };
  };
  threadDetails: {
    key: [emailAccountId: string, threadId: string, variant: string];
    value: CachedThreadDetail;
    indexes: {
      byAccount: string;
      byLastAccessed: number;
      byAccountLastAccessed: [string, number];
    };
  };
  threadRows: {
    key: [emailAccountId: string, threadId: string];
    value: CachedThreadRow;
    indexes: { byAccount: string; byAccountLastAccessed: [string, number] };
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

const GENERATION_PREFIX = "inbox-zero:email-cache-generation:";
type EmailCacheEpoch = readonly [
  cache: number,
  account: number,
  globalGeneration: string,
  accountGeneration: string,
];

export function getEmailCacheDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  if (databasePromise) return databasePromise;

  databasePromise = openDB<EmailCacheSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 14) {
        database.createObjectStore("localMailSyncStates", {
          keyPath: "emailAccountId",
        });
        const jobs = database.createObjectStore("localMailSyncJobs", {
          keyPath: ["emailAccountId", "id"],
        });
        jobs.createIndex("byAccount", "emailAccountId");
        jobs.createIndex("byAccountPriority", [
          "emailAccountId",
          "priority",
          "nextAttemptAt",
        ]);
        database.createObjectStore("localMailSyncSeen", {
          keyPath: ["emailAccountId", "generation", "messageId"],
        });
      }
      if (oldVersion < 13) {
        database.createObjectStore("localMailTombstones", {
          keyPath: ["emailAccountId", "messageId"],
        });
        const messages = database.createObjectStore("localMailMessages", {
          keyPath: ["emailAccountId", "messageId"],
        });
        messages.createIndex("byAccount", "emailAccountId");
        messages.createIndex("byAccountThreadMessage", [
          "emailAccountId",
          "threadId",
          "messageId",
        ]);
        messages.createIndex("byAccountReceivedAt", [
          "emailAccountId",
          "receivedAt",
        ]);
      }
      if (oldVersion < 12) {
        database.createObjectStore("searchIndexAccounts", {
          keyPath: "emailAccountId",
        });
        const work = database.createObjectStore("searchIndexWork", {
          keyPath: ["emailAccountId", "threadId"],
        });
        work.createIndex("byAccount", "emailAccountId");
      }
      if (oldVersion < 13) {
        transaction
          .objectStore("searchIndexWork")
          .createIndex("byAccountStatus", ["emailAccountId", "status"]);
      }
      if (oldVersion < 11) {
        database.createObjectStore("mailboxSyncJobs", {
          keyPath: "emailAccountId",
        });
      }
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
      if (oldVersion < 10) {
        for (const store of ["threadRows", "threadDetails"] as const) {
          transaction
            .objectStore(store)
            .createIndex("byAccountLastAccessed", [
              "emailAccountId",
              "lastAccessedAt",
            ]);
        }
      }
      if (oldVersion < 9) {
        // Older clients could retain details after their sync cursor had advanced.
        transaction.objectStore("threadDetails").clear();
      }
      if (oldVersion < 8) {
        if (oldVersion >= 6)
          transaction
            .objectStore("mailMutations")
            .deleteIndex("byAccountDiagnostics");
        transaction
          .objectStore("mailMutations")
          .createIndex("byAccountDiagnostics", [
            "emailAccountId",
            "id",
            "createdAt",
            "status",
            "batchId",
            "messageIds",
          ]);
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
  const generation = readCacheGeneration(emailAccountId);
  if (!generation) return;
  return [cacheEpoch, accountEpochs.get(emailAccountId) ?? 0, ...generation];
}

export function isEmailCacheEpochCurrent(
  emailAccountId: string,
  epoch: EmailCacheEpoch | undefined,
) {
  if (!epoch || isCacheInvalidationActive(emailAccountId)) return false;
  const [
    capturedCacheEpoch,
    capturedAccountEpoch,
    globalGeneration,
    accountGeneration,
  ] = epoch;
  const generation = readCacheGeneration(emailAccountId);
  return (
    capturedCacheEpoch === cacheEpoch &&
    capturedAccountEpoch === (accountEpochs.get(emailAccountId) ?? 0) &&
    generation?.[0] === globalGeneration &&
    generation[1] === accountGeneration
  );
}

export async function clearEmailCache() {
  invalidateCacheGeneration();
  clearMailActivation();
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
        "mailboxSyncJobs",
        "searchIndexAccounts",
        "searchIndexWork",
        "localMailSyncStates",
        "localMailSyncJobs",
        "localMailSyncSeen",
        "localMailMessages",
        "localMailTombstones",
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
      transaction.objectStore("mailboxSyncJobs").clear(),
      transaction.objectStore("searchIndexAccounts").clear(),
      transaction.objectStore("searchIndexWork").clear(),
      transaction.objectStore("localMailSyncStates").clear(),
      transaction.objectStore("localMailSyncJobs").clear(),
      transaction.objectStore("localMailSyncSeen").clear(),
      transaction.objectStore("localMailMessages").clear(),
      transaction.objectStore("localMailTombstones").clear(),
      transaction.objectStore("mailMutations").clear(),
      transaction.objectStore("replyDrafts").clear(),
      transaction.done,
    ]);
  } catch {
    // Browser storage is a performance enhancement; clearing it must not block logout.
  } finally {
    cacheInvalidationCount -= 1;
    notifyEmailCacheChange();
    cleanupSearchIndex().catch(() => {});
  }
}

export async function clearEmailCacheForAccount(emailAccountId: string) {
  let indexGeneration: string | undefined;
  invalidateCacheGeneration(emailAccountId);
  clearMailActivation(emailAccountId);
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
        "mailboxSyncJobs",
        "searchIndexAccounts",
        "searchIndexWork",
        "localMailSyncStates",
        "localMailSyncJobs",
        "localMailSyncSeen",
        "localMailMessages",
        "localMailTombstones",
        "mailMutations",
        "replyDrafts",
      ],
      "readwrite",
    );
    indexGeneration = (
      await transaction.objectStore("searchIndexAccounts").get(emailAccountId)
    )?.generation;
    const rows = transaction.objectStore("threadRows");
    const views = transaction.objectStore("threadViews");
    const details = transaction.objectStore("threadDetails");
    const messages = transaction.objectStore("mailboxMessages");
    const mutations = transaction.objectStore("mailMutations");
    const drafts = transaction.objectStore("replyDrafts");
    const indexWork = transaction.objectStore("searchIndexWork");
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
      indexWork.delete(
        IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []]),
      ),
      transaction.objectStore("searchIndexAccounts").delete(emailAccountId),
      transaction
        .objectStore("localMailTombstones")
        .delete(IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []])),
      transaction
        .objectStore("localMailMessages")
        .delete(IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []])),
      transaction.objectStore("localMailSyncStates").delete(emailAccountId),
      transaction
        .objectStore("localMailSyncJobs")
        .delete(IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []])),
      transaction
        .objectStore("localMailSyncSeen")
        .delete(IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []])),
      transaction.objectStore("mailboxSyncStates").delete(emailAccountId),
      transaction.objectStore("mailboxSyncJobs").delete(emailAccountId),
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
    notifyEmailCacheChange(emailAccountId);
    cleanupSearchIndex(emailAccountId, indexGeneration).catch(() => {});
  }
}

function isCacheInvalidationActive(emailAccountId: string) {
  return (
    cacheInvalidationCount > 0 ||
    (accountInvalidationCounts.get(emailAccountId) ?? 0) > 0
  );
}

function readCacheGeneration(
  emailAccountId: string,
): readonly [string, string] | undefined {
  if (typeof window === "undefined") return ["", ""];
  try {
    const keys = [
      `${GENERATION_PREFIX}global`,
      `${GENERATION_PREFIX}account:${emailAccountId}`,
    ];
    const values = keys.map((key) => {
      const current = window.localStorage.getItem(key);
      if (current) return current;
      const generation = randomUuid();
      window.localStorage.setItem(key, generation);
      return generation;
    });
    return [values[0], values[1]];
  } catch {
    // Without shared invalidation state, work cannot safely survive tab changes.
    return;
  }
}

function invalidateCacheGeneration(emailAccountId?: string) {
  if (typeof window === "undefined") return;
  const scope =
    emailAccountId === undefined ? "global" : `account:${emailAccountId}`;
  const key = GENERATION_PREFIX + scope;
  try {
    window.localStorage.setItem(key, randomUuid());
  } catch {
    // A denied write must not leave a readable old token authorizing queued work.
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage access denial also makes generation reads fail closed.
    }
  }
}
