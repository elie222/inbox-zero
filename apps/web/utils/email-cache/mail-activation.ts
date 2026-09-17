const STORAGE_PREFIX = "inbox-zero:mail-activation:";
const CHANGE_EVENT = "inbox-zero:mail-activation-changed";

export function isMailSyncActivated(emailAccountId: string): boolean {
  if (typeof window === "undefined" || !emailAccountId) return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + emailAccountId) === "1";
  } catch {
    return false;
  }
}

export function activateMailSync(emailAccountId: string) {
  if (typeof window === "undefined" || !emailAccountId) return;
  if (isMailSyncActivated(emailAccountId)) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + emailAccountId, "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Without durable activation, leave background downloads disabled.
  }
}

export function clearMailActivation(emailAccountId?: string) {
  if (typeof window === "undefined") return;
  try {
    if (emailAccountId !== undefined) {
      window.localStorage.removeItem(STORAGE_PREFIX + emailAccountId);
    } else {
      const keys: string[] = [];
      for (let index = 0; index < window.localStorage.length; index++) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
      }
      for (const key of keys) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may already be unavailable during account cleanup.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToMailActivation(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
