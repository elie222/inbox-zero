import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Google Tag Manager handling
      matcher: ({ url }) =>
        url.hostname === "www.googletagmanager.com" ||
        url.hostname === "tagmanager.google.com",
      handler: new NetworkOnly({
        plugins: [
          {
            handlerDidError: async ({ request }) => {
              console.error(`Failed to fetch: ${request.url}`);
              return Response.error();
            },
          },
        ],
      }),
    },
    ...defaultCache,
  ],
  disableDevLogs: true,
});

serwist.addEventListeners();
