"use client";

import type React from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  SAVE_OFFLINE_MAIL,
  SKIP_WAITING,
  isOfflineMailPath,
} from "@/utils/offline/mail-cache";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { toast } from "sonner";
import { SWRConfig } from "swr";
import { swrFetcher } from "./swr-fetcher";
import {
  DESKTOP_WEB_UPDATE_LAST_PROMPTED_KEY,
  getInboxZeroDesktopApp,
  shouldCheckForDesktopWebUpdate,
  shouldPromptDesktopWebUpdate,
} from "@/utils/desktop-app";

const DESKTOP_WEB_UPDATE_TOAST_ID = "desktop-web-update";
const DESKTOP_WEB_UPDATE_RELOAD_GRACE_MS = 3000;

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
      <SignalDesktopReady />
      <SWRConfig value={{ fetcher: swrFetcher }}>
        <NuqsAdapter>{props.children}</NuqsAdapter>
      </SWRConfig>
    </SerwistProvider>
  );
}

// SerwistProvider's own register drops the promise, so the failures that come
// with crawlers, webviews and private browsing surface as unhandled rejections.
// Registration failures must not interrupt the online app.
function ManageServiceWorker() {
  const { serwist } = useSerwist();
  const pathname = usePathname();

  useEffect(() => {
    if (!serwist) return;

    const isDesktopApp = Boolean(getInboxZeroDesktopApp());
    const pageLoadedAt = Date.now();
    let hadController = Boolean(navigator.serviceWorker.controller);
    let lastCheckedAt: number | null = null;
    let lastPromptedAt = readDesktopWebUpdateLastPromptedAt();
    let registration: ServiceWorkerRegistration | undefined;
    let stopWatchingForWaiting: (() => void) | undefined;
    let refreshing = false;

    const saveOfflineMail = () => {
      saveOfflineMailPage(
        navigator.serviceWorker.controller ?? registration?.active,
      );
    };

    const reloadForUpdate = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const activateWaitingWorker = () => {
      registration?.waiting?.postMessage({ type: SKIP_WAITING });
      reloadForUpdate();
    };

    const notifyAboutWaitingUpdate = () => {
      const now = Date.now();
      if (
        !shouldPromptDesktopWebUpdate({
          isDesktopApp,
          hasController: Boolean(navigator.serviceWorker.controller),
          hasWaitingWorker: Boolean(registration?.waiting),
          lastPromptedAt,
          now,
        })
      ) {
        return;
      }

      lastPromptedAt = now;
      writeDesktopWebUpdateLastPromptedAt(now);
      toast.info("Update available", {
        action: {
          label: "Reload",
          onClick: activateWaitingWorker,
        },
        description: "Reload Inbox Zero to use the latest version.",
        duration: Number.POSITIVE_INFINITY,
        id: DESKTOP_WEB_UPDATE_TOAST_ID,
      });
    };

    const handleWaitingWorker = () => {
      if (!registration?.waiting) return;
      if (!navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: SKIP_WAITING });
        return;
      }
      notifyAboutWaitingUpdate();
    };

    const watchForWaitingWorker = (
      serviceWorkerRegistration: ServiceWorkerRegistration,
    ) => {
      stopWatchingForWaiting?.();
      registration = serviceWorkerRegistration;
      const onUpdateFound = () => {
        const installing = serviceWorkerRegistration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") handleWaitingWorker();
        });
      };
      serviceWorkerRegistration.addEventListener("updatefound", onUpdateFound);
      stopWatchingForWaiting = () => {
        serviceWorkerRegistration.removeEventListener(
          "updatefound",
          onUpdateFound,
        );
      };
      handleWaitingWorker();
    };

    const onControllerChange = () => {
      saveOfflineMail();
      if (
        hadController &&
        isDesktopApp &&
        Date.now() - pageLoadedAt >= DESKTOP_WEB_UPDATE_RELOAD_GRACE_MS
      ) {
        reloadForUpdate();
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
      saveOfflineMail();
      try {
        registration ??= await navigator.serviceWorker.getRegistration();
        if (registration) watchForWaitingWorker(registration);
        await registration?.update();
        handleWaitingWorker();
      } catch {
        // Update checks are best-effort and should never interrupt the app.
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);

    serwist
      .register()
      .then((serviceWorkerRegistration) => {
        if (serviceWorkerRegistration) {
          watchForWaitingWorker(serviceWorkerRegistration);
        }
        saveOfflineMail();
        return checkForUpdate();
      })
      .catch(() => {});

    return () => {
      stopWatchingForWaiting?.();
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
    };
  }, [serwist]);

  useEffect(() => {
    if (!serwist || !pathname || !isOfflineMailPath(pathname)) return;
    saveOfflineMailPage(navigator.serviceWorker.controller);
  }, [serwist, pathname]);

  return null;
}

function SignalDesktopReady() {
  useEffect(() => {
    getInboxZeroDesktopApp()?.signalReady?.();
  }, []);
  return null;
}

function saveOfflineMailPage(worker: ServiceWorker | null | undefined) {
  if (
    !isOfflineMailPath(window.location.pathname) ||
    !navigator.onLine ||
    document.visibilityState !== "visible"
  )
    return;
  worker?.postMessage({ type: SAVE_OFFLINE_MAIL });
}

function readDesktopWebUpdateLastPromptedAt(): number | null {
  try {
    const raw = sessionStorage.getItem(DESKTOP_WEB_UPDATE_LAST_PROMPTED_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeDesktopWebUpdateLastPromptedAt(now: number) {
  try {
    sessionStorage.setItem(DESKTOP_WEB_UPDATE_LAST_PROMPTED_KEY, String(now));
  } catch {
    // Private browsing can block storage; the in-memory timestamp still
    // coalesces prompts until the page reloads.
  }
}
