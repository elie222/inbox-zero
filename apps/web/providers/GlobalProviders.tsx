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

// SerwistProvider's own `register` fires the registration promise without a
// rejection handler. Registration legitimately fails for a small share of page
// loads (crawlers, in-app webviews, private browsing, blocked site data), and
// each failure surfaced as an unhandled rejection in error tracking. The
// service worker is precache-only, so a failure is safe to ignore.
// Unlike the built in path this doesn't check the page against a custom scope,
// which is equivalent while no scope option is passed above.
function RegisterServiceWorker() {
  const { serwist } = useSerwist();

  useEffect(() => {
    serwist?.register().catch(() => {});
  }, [serwist]);

  return null;
}
