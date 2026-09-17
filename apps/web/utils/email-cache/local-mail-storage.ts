import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const MIB = 1024 * 1024;
const DEFAULT_BATCH_HEADROOM_BYTES = 16 * MIB;

export type LocalMailStorageAdmission = {
  allowed: boolean;
  reason: "available" | "storage-full" | "storage-unavailable";
  usageBytes?: number;
  budgetBytes: number;
  backfillLimitBytes: number;
  remainingBytes: number;
};

export class LocalMailStorageBusyError extends Error {
  constructor() {
    super("Local mail storage is busy");
    this.name = "LocalMailStorageBusyError";
  }
}

export function withLocalMailStorageLock<T>(commit: () => Promise<T>) {
  if (typeof navigator === "undefined" || !navigator.locks?.request)
    return Promise.reject(
      new Error("Local mail storage coordination unavailable"),
    );
  return navigator.locks.request(
    "inbox-zero:local-mail-storage",
    { ifAvailable: true },
    (lock) => {
      if (!lock) throw new LocalMailStorageBusyError();
      return commit();
    },
  );
}

export async function readLocalMailStorageAdmission(options?: {
  budgetBytes?: number;
  expectedGrowthBytes?: number;
}): Promise<LocalMailStorageAdmission> {
  const desktop = !!getInboxZeroDesktopApp();
  let estimate: StorageEstimate | undefined;
  try {
    estimate = await navigator.storage?.estimate();
  } catch {
    // Unknown headroom must not start speculative historical downloads.
  }
  return evaluateLocalMailStorageAdmission({ ...options, desktop, estimate });
}

export function evaluateLocalMailStorageAdmission({
  desktop,
  estimate,
  budgetBytes = (desktop ? 2048 : 500) * MIB,
  expectedGrowthBytes = DEFAULT_BATCH_HEADROOM_BYTES,
}: {
  desktop: boolean;
  estimate?: StorageEstimate;
  budgetBytes?: number;
  expectedGrowthBytes?: number;
}): LocalMailStorageAdmission {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0)
    throw new Error("Invalid local mail storage budget");
  if (!Number.isSafeInteger(expectedGrowthBytes) || expectedGrowthBytes < 0)
    throw new Error("Invalid local mail storage growth estimate");

  const usage = estimate?.usage;
  const quota = estimate?.quota;
  if (
    typeof usage !== "number" ||
    !Number.isFinite(usage) ||
    usage < 0 ||
    typeof quota !== "number" ||
    !Number.isFinite(quota) ||
    quota <= 0
  ) {
    return {
      allowed: false,
      reason: "storage-unavailable",
      budgetBytes,
      backfillLimitBytes: 0,
      remainingBytes: 0,
    };
  }

  // Origin usage includes every account, the index, attachments, and other app
  // caches. Counting all of it conservatively avoids multiplying device limits.
  const effectiveBudget = Math.floor(Math.min(budgetBytes, quota * 0.8));
  const reserve = Math.max(32 * MIB, effectiveBudget * 0.1);
  const backfillLimitBytes = Math.max(0, Math.floor(effectiveBudget - reserve));
  const remainingBytes = Math.max(0, backfillLimitBytes - usage);
  const allowed =
    usage < backfillLimitBytes && expectedGrowthBytes <= remainingBytes;
  return {
    allowed,
    reason: allowed ? "available" : "storage-full",
    usageBytes: usage,
    budgetBytes: effectiveBudget,
    backfillLimitBytes,
    remainingBytes,
  };
}
