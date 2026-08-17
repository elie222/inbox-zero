// Persists a small whitelist of SWR cache entries to localStorage so the app
// shell (sidebar labels, counts, folders, mail settings) renders instantly on
// a cold load instead of flashing empty. Mail content itself is persisted
// separately in utils/email-cache (IndexedDB).

const STORAGE_PREFIX = "inbox-zero:swr:v1:";

// These hooks use plain-string SWR keys that are not account-scoped (the
// account travels in a request header), so the snapshot is namespaced by
// emailAccountId instead.
const PERSISTED_KEYS = [
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

export function readPersistedSwrEntries(
  emailAccountId: string | null | undefined,
): Map<string, SwrCacheState> {
  const entries = new Map<string, SwrCacheState>();
  if (!emailAccountId || typeof window === "undefined") return entries;

  try {
    const raw = window.localStorage.getItem(storageKey(emailAccountId));
    if (!raw) return entries;
    const snapshot: unknown = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object") return entries;

    for (const key of PERSISTED_KEYS) {
      const data = (snapshot as Record<string, unknown>)[key];
      if (data !== undefined) {
        // Hydrated data is stale by definition; SWR revalidates on mount.
        entries.set(key, { data, isLoading: false, isValidating: false });
      }
    }
  } catch {
    // Hydration is best-effort; a corrupt snapshot must never break the app.
  }
  return entries;
}

export function persistSwrEntries(
  emailAccountId: string | null | undefined,
  cache: ReadableCache,
) {
  if (!emailAccountId || typeof window === "undefined") return;

  try {
    const snapshot: Record<string, unknown> = {};
    let hasData = false;
    for (const key of PERSISTED_KEYS) {
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
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(emailAccountId));
  } catch {
    // Ignore storage failures.
  }
}

function storageKey(emailAccountId: string) {
  return `${STORAGE_PREFIX}${emailAccountId}`;
}

function persistedStorageKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}
