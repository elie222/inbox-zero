import type { IDBPTransaction, StoreNames } from "idb";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type EmailCacheSchema,
} from "./database";
import type { SearchMessage } from "./search-query";

type CacheTransaction = IDBPTransaction<
  EmailCacheSchema,
  StoreNames<EmailCacheSchema>[],
  "readwrite"
>;

export type LocalMailCacheContext = {
  epoch: ReturnType<typeof captureEmailCacheEpoch>;
  generation?: string;
  revision?: number;
};

// Capture before starting a provider request, never when its response arrives.
export async function captureLocalMailCacheContext(emailAccountId: string) {
  try {
    const epoch = captureEmailCacheEpoch(emailAccountId);
    const database = await getEmailCacheDatabase();
    if (!database) return;
    const account = await database.get("searchIndexAccounts", emailAccountId);
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    return {
      epoch,
      generation: account?.generation,
      revision: account?.retentionRevision,
    } satisfies LocalMailCacheContext;
  } catch {
    return;
  }
}

export async function isLocalMailCacheContextCurrent(
  transaction: CacheTransaction,
  emailAccountId: string,
  context: LocalMailCacheContext | undefined,
) {
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (!context) return account?.retentionRevision === undefined;
  if (
    !isEmailCacheEpochCurrent(emailAccountId, context.epoch) ||
    account?.generation !== context.generation ||
    account?.retentionRevision !== context.revision
  )
    return false;
  if (context.revision === undefined) return true;
  const policy = await transaction
    .objectStore("localMailRetentionPolicies")
    .get(emailAccountId);
  return (
    policy?.generation === context.generation &&
    policy?.revision === context.revision
  );
}

// Legacy rows contain message snippets and participant metadata too. Drop the
// entire snapshot when it includes locally absent mail instead of hiding IDs.
export async function canPersistLocalMailSnapshot(
  transaction: CacheTransaction,
  emailAccountId: string,
  messages: SearchMessage[] | undefined,
) {
  const policy = await transaction
    .objectStore("localMailRetentionPolicies")
    .get(emailAccountId);
  if (!policy) return true;
  if (!messages?.length) return false;
  const checkedThreads = new Set<string>();
  for (const message of messages) {
    if (!checkedThreads.has(message.threadId)) {
      const evicted = await transaction
        .objectStore("localMailEvictedMessages")
        .index("byAccountThread")
        .getKey([emailAccountId, message.threadId]);
      if (evicted !== undefined) return false;
      checkedThreads.add(message.threadId);
    }
    const marker = await transaction
      .objectStore("localMailEvictedMessages")
      .getKey([emailAccountId, message.id]);
    if (marker !== undefined) return false;
    const retained = await transaction
      .objectStore("localMailMessages")
      .getKey([emailAccountId, message.id]);
    const timestamp = Number(
      message.internalDate ||
        Date.parse(message.date ?? message.headers.date ?? ""),
    );
    if (
      retained === undefined &&
      (!Number.isFinite(timestamp) ||
        timestamp < Math.max(policy.requestedAfter, policy.automaticAfter))
    )
      return false;
  }
  return true;
}
