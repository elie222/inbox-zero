"use client";

import type React from "react";
import { useEffect } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SerwistProvider, useSerwist } from "@serwist/next/react";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    // Registers the service worker built by `serwist build`; the @serwist/next
    // webpack plugin used to inject this registration, but it doesn't support
    // Turbopack. cacheOnNavigation={false} matches the old plugin default.
    <SerwistProvider
      swUrl="/sw.js"
      register={false}
      cacheOnNavigation={false}
      disable={process.env.NODE_ENV !== "production"}
    >
      <RegisterServiceWorker />
      <NuqsAdapter>{props.children}</NuqsAdapter>
    </SerwistProvider>
  );
}

// SerwistProvider's own register drops the promise, so the failures that come
// with crawlers, webviews and private browsing surface as unhandled rejections.
// The worker is precache-only, so swallowing them is safe.
function RegisterServiceWorker() {
  const { serwist } = useSerwist();

  useEffect(() => {
    serwist?.register().catch(() => {});
  }, [serwist]);

  return null;
}
