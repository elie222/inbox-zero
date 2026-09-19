import { isLocalMailStorageLedgerReady } from "./local-mail-storage-ledger";
import {
  createAccountedMailTransaction,
  withOptionalMailCacheWrite,
} from "./optional-cache-write";
import { randomUuid } from "@/utils/uuid";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { isMailSyncActivated } from "./mail-activation";
import { storeLocalMailMessages } from "./local-mail-messages";
import { SOURCE_VERSION } from "./search-index-source-version";
import { markSearchThreadsDirty } from "./search-index-work";
import type { SearchMessage } from "./search-query";
import {
  EMAIL_CACHE_MAX_AGE_MS,
  EMAIL_CACHE_MAILBOX_MAX_AGE_MS,
} from "./policy";

export async function initializeSearchIndexAccount(emailAccountId: string) {
  if (!isMailSyncActivated(emailAccountId)) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  const current = await database.get("searchIndexAccounts", emailAccountId);
  if (
    !isMailSyncActivated(emailAccountId) ||
    !isEmailCacheEpochCurrent(emailAccountId, epoch)
  )
    return;
  if (current?.sourceVersion === SOURCE_VERSION) return current;
  const transaction = await createAccountedMailTransaction(database, [
    "searchIndexAccounts",
    "searchIndexWork",
    "localMailMessages",
    "localMailTombstones",
    "localMailRetentionPolicies",
    "localMailEvictionJobs",
    "localMailThreadProtection",

    "localMailAttachmentFiles",
    "localMailAttachmentJobs",
  ]);
  const accounts = transaction.objectStore("searchIndexAccounts");
  const existing = await accounts.get(emailAccountId);
  const policy = await transaction
    .objectStore("localMailRetentionPolicies")
    .get(emailAccountId);
  if (
    !isMailSyncActivated(emailAccountId) ||
    !isEmailCacheEpochCurrent(emailAccountId, epoch)
  ) {
    await transaction.done;
    return;
  }
  const account =
    existing?.sourceVersion === SOURCE_VERSION
      ? existing
      : {
          emailAccountId,
          generation: randomUuid(),
          sourceVersion: SOURCE_VERSION,
          messageBytes: existing?.messageBytes ?? 0,
          attachmentBytes: existing?.attachmentBytes ?? 0,
          retentionRevision: policy?.revision,
          evictionMarkerBytes: existing?.evictionMarkerBytes,
          seed: {
            store: existing
              ? ("localMailMessages" as const)
              : ("mailboxMessages" as const),
          },
        };
  if (account !== existing) {
    const range = IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []]);
    // Rebuilding source data must not reset the user's retention or pins.
    if (policy) {
      await transaction.objectStore("localMailRetentionPolicies").put({
        ...policy,
        generation: account.generation,
      });
    }
    const eviction = await transaction
      .objectStore("localMailEvictionJobs")
      .get(emailAccountId);
    if (eviction) {
      await transaction.objectStore("localMailEvictionJobs").put({
        ...eviction,
        generation: account.generation,
        stage: "remove-source",
        cursor: undefined,
      });
    }
    let protection = await transaction
      .objectStore("localMailThreadProtection")
      .openCursor(range);
    while (protection) {
      await protection.update({
        ...protection.value,
        generation: account.generation,
      });
      protection = await protection.continue();
    }
    await Promise.all([
      transaction.objectStore("searchIndexWork").delete(range),
      accounts.put(account),
    ]);
  }
  await transaction.done;
  return account;
}

export async function seedSearchIndexWork(emailAccountId: string) {
  if (!isMailSyncActivated(emailAccountId)) return;
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const result = await withOptionalMailCacheWrite(
    database,
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailTombstones",
      "localMailRetentionPolicies",
      "localMailEvictedMessages",
      "mailboxMessages",
      "threadRows",
      "threadDetails",

      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
      "localMailThreadProtection",
    ],
    async (transaction) => {
      const accounts = transaction.objectStore("searchIndexAccounts");
      const account = await accounts.get(emailAccountId);
      if (!account || !isMailSyncActivated(emailAccountId)) {
        await transaction.done;
        return;
      }
      if (!account.seed) {
        await transaction.done;
        return { generation: account.generation, complete: true };
      }
      const seed = account.seed;
      const range = IDBKeyRange.bound(
        seed.after ?? [emailAccountId, ""],
        [emailAccountId, []],
        !!seed.after,
      );
      let cursor = await transaction.objectStore(seed.store).openCursor(range);
      let count = 0;
      let after = seed.after;
      let messageOffset = seed.messageOffset ?? 0;
      while (cursor && count < 100) {
        const record = cursor.value;
        if (seed.store === "localMailMessages") {
          await markSearchThreadsDirty(transaction, emailAccountId, [
            record.threadId,
          ]);
          count++;
          after = cursor.primaryKey;
          cursor = await cursor.continue();
          continue;
        }
        const fetchedAt =
          "fetchedAt" in record ? record.fetchedAt : record.lastAccessedAt;
        const maxAge =
          seed.store === "mailboxMessages"
            ? EMAIL_CACHE_MAILBOX_MAX_AGE_MS
            : EMAIL_CACHE_MAX_AGE_MS;
        const data = record.data as {
          thread?: { messages?: SearchMessage[] };
          messages?: SearchMessage[];
        };
        const messages =
          seed.store === "mailboxMessages"
            ? [record.data as SearchMessage]
            : (data.thread?.messages ?? data.messages ?? []);
        const retained =
          Date.now() - fetchedAt <= maxAge && Array.isArray(messages)
            ? messages
            : [];
        const page = retained.slice(messageOffset, messageOffset + 100 - count);
        await storeLocalMailMessages(
          transaction,
          emailAccountId,
          page,
          fetchedAt,
          {
            retention:
              account.retentionRevision === undefined
                ? undefined
                : { revision: account.retentionRevision, purpose: "cache" },
            metadataOnly:
              seed.store === "threadDetails" &&
              !("variant" in record && record.variant.endsWith("|replies:0")),
          },
        );
        count += Math.max(1, page.length);
        messageOffset += page.length;
        if (messageOffset < retained.length) break;
        after = cursor.primaryKey;
        messageOffset = 0;
        cursor = await cursor.continue();
      }
      const nextStore = {
        localMailMessages: "mailboxMessages",
        mailboxMessages: "threadRows",
        threadRows: "threadDetails",
        threadDetails: "threadDetails",
      } as const;
      const nextSeed: typeof account.seed | undefined = cursor
        ? { store: seed.store, after, messageOffset }
        : seed.store === "threadDetails"
          ? undefined
          : { store: nextStore[seed.store] };
      const updatedAccount = await accounts.get(emailAccountId);
      if (!updatedAccount)
        throw new Error("Missing search index account during seed");
      await accounts.put({ ...updatedAccount, seed: nextSeed });
      await transaction.done;
      return {
        generation: account.generation,
        complete: nextSeed === undefined,
      };
    },
    "backfill",
  );
  if (result) return result;
  const account = await database.get("searchIndexAccounts", emailAccountId);
  if (!account || !isMailSyncActivated(emailAccountId)) return;
  const ledger = await database.get("localMailStorageLedger", "origin");
  return {
    generation: account.generation,
    complete: false,
    retryAfterMs:
      ledger && isLocalMailStorageLedgerReady(ledger) ? 60_000 : 1000,
  };
}
