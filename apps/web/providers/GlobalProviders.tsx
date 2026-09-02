"use client";

import type React from "react";
import { useEffect } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { toast } from "sonner";
import {
  getInboxZeroDesktopApp,
  shouldCheckForDesktopWebUpdate,
} from "@/utils/desktop-app";

const DESKTOP_WEB_UPDATE_TOAST_ID = "desktop-web-update";

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
      <ManageServiceWorker />
      <NuqsAdapter>{props.children}</NuqsAdapter>
    </SerwistProvider>
  );
}

// SerwistProvider's own register drops the promise, so the failures that come
// with crawlers, webviews and private browsing surface as unhandled rejections.
// The worker is precache-only, so swallowing them is safe.
function ManageServiceWorker() {
  const { serwist } = useSerwist();

  useEffect(() => {
    if (!serwist) return;

    const isDesktopApp = Boolean(getInboxZeroDesktopApp());
    let hadController = Boolean(navigator.serviceWorker.controller);
    let lastCheckedAt: number | null = null;
    let registration: ServiceWorkerRegistration | undefined;

    const notifyAboutUpdate = () => {
      if (hadController && isDesktopApp) {
        toast.info("Update available", {
          action: {
            label: "Reload",
            onClick: () => window.location.reload(),
          },
          description: "Reload Inbox Zero to use the latest version.",
          duration: Number.POSITIVE_INFINITY,
          id: DESKTOP_WEB_UPDATE_TOAST_ID,
        });
      }
      hadController = true;
    };

    const checkForUpdate = async () => {
      const now = Date.now();
      if (
        !shouldCheckForDesktopWebUpdate({
          isDesktopApp,
          isOnline: navigator.onLine,
          isVisible: document.visibilityState === "visible",
          lastCheckedAt,
          now,
        })
      ) {
        return;
      }

      lastCheckedAt = now;
      try {
        registration ??= await navigator.serviceWorker.getRegistration();
        await registration?.update();
      } catch {
        // Update checks are best-effort and should never interrupt the app.
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      notifyAboutUpdate,
    );
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);

    serwist
      .register()
      .then((serviceWorkerRegistration) => {
        registration ??= serviceWorkerRegistration;
        return checkForUpdate();
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        notifyAboutUpdate,
      );
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
    };
  }, [serwist]);

  return null;
}
