import type { IDBPTransaction, StoreNames } from "idb";
import { randomUuid } from "@/utils/uuid";
import type { EmailCacheSchema } from "./database";
import type { LocalMailStorageLedger } from "./local-mail-storage-ledger-types";

export const LOCAL_MAIL_ACCOUNTED_STORES = [
  "localMailMessages",
  "mailboxMessages",
  "threadDetails",
  "threadRows",
  "threadViews",
  "localMailTombstones",
  "localMailEvictedMessages",
  "localMailRetentionPolicies",
  "localMailThreadProtection",
  "localMailEvictionJobs",
  "localMailSyncStates",
  "localMailSyncJobs",
  "localMailSyncSeen",
  "mailboxSyncStates",
  "mailboxSyncJobs",
  "searchIndexAccounts",
  "searchIndexWork",
  "mailMutations",
  "replyDrafts",
  "localMailAttachmentFiles",
  "localMailAttachmentJobs",
] as const satisfies readonly StoreNames<EmailCacheSchema>[];

type Transaction = IDBPTransaction<
  EmailCacheSchema,
  StoreNames<EmailCacheSchema>[],
  "readwrite"
>;

export function localMailRecordBytes(value: unknown) {
  if (value === undefined) return 0;
  if (
    value &&
    typeof value === "object" &&
    "blob" in value &&
    value.blob instanceof Blob
  ) {
    const { blob, ...metadata } = value;
    return blob.size + new Blob([JSON.stringify(metadata)]).size;
  }
  return new Blob([JSON.stringify(value)]).size;
}

export async function readLocalMailStorageLedger(transaction: Transaction) {
  const store = transaction.objectStore("localMailStorageLedger");
  const existing = await store.get("origin");
  if (isValidLedger(existing)) return existing;
  const ledger: LocalMailStorageLedger = {
    id: "origin",
    version: 1,
    epoch: randomUuid(),
    stores: {},
    index: { status: "unknown" },
  };
  await store.put(ledger);
  return ledger;
}

export function isLocalMailStorageLedgerReady(ledger: LocalMailStorageLedger) {
  return (
    isValidLedger(ledger) &&
    ledger.index.status === "ready" &&
    typeof ledger.index.bytes === "number" &&
    LOCAL_MAIL_ACCOUNTED_STORES.every((store) => ledger.stores[store]?.complete)
  );
}

export function localMailLedgerBytes(ledger: LocalMailStorageLedger) {
  return (
    Object.values(ledger.stores).reduce(
      (total, store) => total + store.bytes,
      0,
    ) +
    (ledger.index.bytes ?? 0) +
    (ledger.index.pending?.reservedGrowthBytes ?? 0)
  );
}

export function applyLocalMailStorageDelta(
  ledger: LocalMailStorageLedger,
  storeName: string,
  primaryKey: IDBValidKey,
  delta: number,
) {
  if (storeName === "localMailStorageLedger") return;
  const checkpoint = ledger.stores[storeName];
  if (
    !checkpoint ||
    (!checkpoint.complete &&
      (checkpoint.afterKey === undefined ||
        indexedDB.cmp(primaryKey, checkpoint.afterKey) > 0))
  )
    return;
  if (
    !Number.isSafeInteger(checkpoint.bytes + delta) ||
    checkpoint.bytes + delta < 0
  ) {
    // Interrupted instrumentation or an old writer requires a recount, never clamping.
    ledger.stores = {};
    ledger.epoch = randomUuid();
    return;
  }
  checkpoint.bytes += delta;
}

export function evaluateLocalMailLogicalAdmission({
  ledger,
  limitBytes,
  originRemainingBytes = Number.POSITIVE_INFINITY,
  reservedGrowthBytes = 0,
  expectedGrowthBytes = 0,
}: {
  ledger: LocalMailStorageLedger;
  limitBytes: number;
  originRemainingBytes?: number;
  reservedGrowthBytes?: number;
  expectedGrowthBytes?: number;
}) {
  if (
    ![limitBytes, reservedGrowthBytes, expectedGrowthBytes].every(
      isByteCount,
    ) ||
    !(originRemainingBytes >= 0) ||
    (originRemainingBytes !== Number.POSITIVE_INFINITY &&
      !Number.isFinite(originRemainingBytes))
  )
    throw new Error("Invalid logical storage allowance");
  const ready = isLocalMailStorageLedgerReady(ledger);
  const usedBytes = isValidLedger(ledger) ? localMailLedgerBytes(ledger) : 0;
  // Until the scan finishes there is no measured total, so the logical budget
  // cannot constrain yet and only physical headroom applies. Writing meanwhile
  // is safe because the scan counts those rows when it reaches them, and
  // refusing instead would mean caching nothing until the scan completes.
  const remainingBytes = ready
    ? Math.max(
        0,
        Math.min(
          originRemainingBytes,
          limitBytes - usedBytes - reservedGrowthBytes,
        ),
      )
    : originRemainingBytes;
  const allowed = expectedGrowthBytes <= remainingBytes;
  return {
    allowed,
    reason: !ready
      ? ("ledger-incomplete" as const)
      : allowed
        ? ("available" as const)
        : ("storage-full" as const),
    remainingBytes,
    usedBytes,
    limitBytes,
  };
}

function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isValidLedger(value: unknown): value is LocalMailStorageLedger {
  if (
    !isRecord(value) ||
    value.id !== "origin" ||
    value.version !== 1 ||
    typeof value.epoch !== "string" ||
    !value.epoch ||
    !isRecord(value.stores) ||
    !isRecord(value.index)
  )
    return false;
  let total = 0;
  for (const [name, checkpoint] of Object.entries(value.stores)) {
    if (
      !(LOCAL_MAIL_ACCOUNTED_STORES as readonly string[]).includes(name) ||
      !isRecord(checkpoint) ||
      !isByteCount(checkpoint.bytes) ||
      typeof checkpoint.complete !== "boolean"
    )
      return false;
    if (
      checkpoint.afterKey !== undefined &&
      !isCheckpointKey(name, checkpoint.afterKey)
    )
      return false;
    if (
      !checkpoint.complete &&
      checkpoint.afterKey === undefined &&
      checkpoint.bytes !== 0
    )
      return false;
    total += checkpoint.bytes;
  }
  const index = value.index;
  if (index.status !== "unknown" && index.status !== "ready") return false;
  if (
    (index.status === "ready" || index.bytes !== undefined) &&
    !isByteCount(index.bytes)
  )
    return false;
  total += (index.bytes as number | undefined) ?? 0;
  if (index.pending !== undefined) {
    if (
      !isRecord(index.pending) ||
      typeof index.pending.token !== "string" ||
      !index.pending.token ||
      !isByteCount(index.pending.reservedGrowthBytes) ||
      index.status !== "ready"
    )
      return false;
    total += index.pending.reservedGrowthBytes;
  }
  return isByteCount(total);
}
function isCheckpointKey(name: string, key: unknown): boolean {
  const lengths: Record<string, number> = {
    localMailMessages: 2,
    mailboxMessages: 2,
    threadDetails: 3,
    threadRows: 2,
    threadViews: 2,
    localMailTombstones: 2,
    localMailEvictedMessages: 2,
    localMailRetentionPolicies: 0,
    localMailThreadProtection: 2,
    localMailEvictionJobs: 0,
    localMailSyncStates: 0,
    localMailSyncJobs: 2,
    localMailSyncSeen: 3,
    mailboxSyncStates: 0,
    mailboxSyncJobs: 0,
    searchIndexAccounts: 0,
    searchIndexWork: 2,
    mailMutations: 0,
    replyDrafts: 3,
    localMailAttachmentFiles: 4,
    localMailAttachmentJobs: 4,
  };
  const length = lengths[name];
  // Every accounted store uses inline string identity keys, singly or in a compound key.
  return length === 0
    ? typeof key === "string"
    : Array.isArray(key) &&
        key.length === length &&
        key.every((part) => typeof part === "string");
}
