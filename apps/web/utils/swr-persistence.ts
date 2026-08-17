// Persists a small whitelist of SWR cache entries to localStorage so the app
// shell (sidebar labels, counts, folders, mail settings) renders instantly on
// a cold load instead of flashing empty. Mail content itself is persisted
// separately in utils/email-cache (IndexedDB).

const STORAGE_PREFIX = "inbox-zero:swr:v1:";

// These hooks use plain-string SWR keys that are not account-scoped (the
// account travels in a request header), so the snapshot is namespaced by
// emailAccountId instead.
export const PERSISTED_SWR_KEYS = [
  "/api/labels",
  "/api/labels/counts",
  "/api/user/folders",
  "/api/mail/settings",
] as const;

type SwrCacheState = {
  data?: unknown;
  isLoading?: boolean;
  isValidating?: boolean;
};

// Matches both a plain Map and SWR's Cache interface.
type ReadableCache = {
  get(key: string): SwrCacheState | undefined;
};

// Set by the clear functions so a later pagehide/visibility snapshot can't
// resurrect cleared data from the still-warm in-memory cache — the logout
// redirect itself fires pagehide. Module state resets on the next page load,
// which is exactly the lifetime the block needs.
let allPersistenceBlocked = false;
const blockedAccountIds = new Set<string>();

export function readPersistedSwrEntries(
  emailAccountId: string | null | undefined,
): Map<string, SwrCacheState> {
  const entries = new Map<string, SwrCacheState>();
  if (!emailAccountId || typeof window === "undefined") return entries;

  for (const [key, data] of Object.entries(readRawSnapshot(emailAccountId))) {
    // Hydrated data is stale by definition; SWR revalidates on mount.
    entries.set(key, { data, isLoading: false, isValidating: false });
  }
  return entries;
}

export function persistSwrEntries(
  emailAccountId: string | null | undefined,
  cache: ReadableCache,
) {
  if (!emailAccountId || typeof window === "undefined") return;
  if (allPersistenceBlocked || blockedAccountIds.has(emailAccountId)) return;

  try {
    // Seed from the stored snapshot so a page that only fetched a subset of
    // the whitelisted keys doesn't drop the rest on overwrite.
    const snapshot = readRawSnapshot(emailAccountId);
    let hasData = false;
    for (const key of PERSISTED_SWR_KEYS) {
      const data = cache.get(key)?.data;
      if (data !== undefined) {
        snapshot[key] = data;
        hasData = true;
      }
    }
    if (!hasData) return;
    window.localStorage.setItem(
      storageKey(emailAccountId),
      JSON.stringify(snapshot),
    );
  } catch {
    // Quota or serialization failures must never break the app.
  }
}

export function clearPersistedSwrCache() {
  allPersistenceBlocked = true;
  if (typeof window === "undefined") return;
  try {
    for (const key of persistedStorageKeys()) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures during logout.
  }
}

export function clearPersistedSwrCacheForAccount(emailAccountId: string) {
  blockedAccountIds.add(emailAccountId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(emailAccountId));
  } catch {
    // Ignore storage failures.
  }
}

/** Maps a localStorage key back to its account id; null for unrelated keys. */
export function accountIdFromSnapshotKey(key: string): string | null {
  if (!key.startsWith(STORAGE_PREFIX)) return null;
  return key.slice(STORAGE_PREFIX.length) || null;
}

export function resetSwrPersistenceBlocksForTesting() {
  allPersistenceBlocked = false;
  blockedAccountIds.clear();
}

function storageKey(emailAccountId: string) {
  return `${STORAGE_PREFIX}${emailAccountId}`;
}

function readRawSnapshot(emailAccountId: string): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  try {
    const raw = window.localStorage.getItem(storageKey(emailAccountId));
    if (!raw) return snapshot;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return snapshot;
    }
    for (const key of PERSISTED_SWR_KEYS) {
      const data = (parsed as Record<string, unknown>)[key];
      if (data !== undefined) snapshot[key] = data;
    }
  } catch {
    // A corrupt snapshot must never break the app.
  }
  return snapshot;
}

function persistedStorageKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}
