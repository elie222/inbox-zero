import {
  CLEAR_OFFLINE_MAIL,
  CLEAR_OFFLINE_MAIL_ACCOUNT,
  isSafeOfflineMailAccountId,
  OFFLINE_MAIL_CACHE_PREFIX,
  offlineMailAccountCacheKeys,
} from "./mail-cache";

export async function clearOfflineMailCache() {
  await postToMailWorker({ type: CLEAR_OFFLINE_MAIL });
  if (typeof caches === "undefined") return;
  try {
    await Promise.all(
      (await caches.keys())
        .filter((name) => name.startsWith(OFFLINE_MAIL_CACHE_PREFIX))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Cache Storage can be unavailable in private browsing.
  }
}

export async function clearOfflineMailCacheForAccount(emailAccountId: string) {
  if (!isSafeOfflineMailAccountId(emailAccountId)) return;
  await postToMailWorker({
    type: CLEAR_OFFLINE_MAIL_ACCOUNT,
    accountId: emailAccountId,
  });
  if (typeof window === "undefined" || typeof caches === "undefined") return;
  const origin = window.location.origin;
  const { mailKeys, accountsKey } = offlineMailAccountCacheKeys(
    origin,
    emailAccountId,
  );
  const keys = [...mailKeys, accountsKey];
  try {
    await Promise.all(
      (await caches.keys())
        .filter((name) => name.startsWith(OFFLINE_MAIL_CACHE_PREFIX))
        .map(async (name) => {
          const cache = await caches.open(name);
          await Promise.all(keys.map((key) => cache.delete(key)));
        }),
    );
  } catch {
    // Cache Storage can be unavailable in private browsing.
  }
}

async function postToMailWorker(data: Record<string, string>) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = navigator.serviceWorker.controller ?? registration?.active;
    if (!worker) return;
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const finish = () => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve();
      };
      const timeout = setTimeout(finish, 3000);
      channel.port1.onmessage = finish;
      worker.postMessage(data, [channel.port2]);
    });
  } catch {
    // A stopped worker must not prevent logout; clear its disk cache below.
  }
}
