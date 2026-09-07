import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import {
  CLEAR_OFFLINE_MAIL,
  SAVE_OFFLINE_MAIL,
  OFFLINE_MAIL_CACHE_PREFIX,
  createOfflineMailCache,
  matchesOfflineMailRequest,
  clearsOfflineMailOnGet,
} from "../utils/offline/mail-cache";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// An old document must not outlive the precached JavaScript it references.
const manifest = self.__SW_MANIFEST;
const cacheNamePromise = crypto.subtle
  .digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest ?? [])))
  .then(
    (hash) =>
      `${OFFLINE_MAIL_CACHE_PREFIX}${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
const mailCachePromise = cacheNamePromise.then((cacheName) =>
  createOfflineMailCache({ origin: self.location.origin, cacheName }),
);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    cacheNamePromise.then(async (currentCache) => {
      await Promise.all(
        (await caches.keys())
          .filter(
            (name) =>
              name.startsWith(OFFLINE_MAIL_CACHE_PREFIX) &&
              name !== currentCache,
          )
          .map((name) => caches.delete(name)),
      );
    }),
  );
});

self.addEventListener("message", (event) => {
  if (
    event.data?.type !== CLEAR_OFFLINE_MAIL &&
    event.data?.type !== SAVE_OFFLINE_MAIL
  )
    return;
  event.waitUntil(
    (async () => {
      if (!event.source || !("id" in event.source)) return;
      const client = await self.clients.get(event.source.id);
      if (!client || new URL(client.url).origin !== self.location.origin)
        return;
      const cache = await mailCachePromise;
      if (event.data.type === CLEAR_OFFLINE_MAIL) {
        await cache.clear();
        event.ports[0]?.postMessage({ ok: true });
      } else {
        await cache.save(client.url, (promise) => event.waitUntil(promise));
      }
    })().catch(() => {}),
  );
});

const serwist = new Serwist({
  precacheEntries: manifest,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request }) =>
        matchesOfflineMailRequest(request, self.location.origin),
      handler: async ({ request, event }) =>
        (await mailCachePromise).handle(request, (promise) =>
          event.waitUntil(promise),
        ),
    },
    {
      matcher: ({ request }) =>
        clearsOfflineMailOnGet(request, self.location.origin),
      handler: async ({ request }) => {
        await (await mailCachePromise).clear();
        return fetch(request);
      },
    },
    {
      method: "POST",
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        (url.pathname.startsWith("/api/auth/") ||
          url.pathname === "/api/mobile-auth/exchange-code"),
      handler: async ({ request }) => {
        const cache = await mailCachePromise;
        await cache.clear();
        try {
          return await fetch(request);
        } finally {
          await cache.clear();
        }
      },
    },
  ],
  disableDevLogs: process.env.NODE_ENV === "production",
});

serwist.addEventListeners();
