import { CLEAR_OFFLINE_MAIL, OFFLINE_MAIL_CACHE_PREFIX } from "./mail-cache";

export async function clearOfflineMailCache() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker = navigator.serviceWorker.controller ?? registration?.active;
      if (worker) {
        await new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          const finish = () => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve();
          };
          const timeout = setTimeout(finish, 3000);
          channel.port1.onmessage = finish;
          worker.postMessage({ type: CLEAR_OFFLINE_MAIL }, [channel.port2]);
        });
      }
    } catch {
      // A stopped worker must not prevent logout; clear its disk cache below.
    }
  }
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
