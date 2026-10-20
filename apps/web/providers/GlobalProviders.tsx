"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  SAVE_OFFLINE_MAIL,
  SKIP_WAITING,
  isOfflineMailPath,
} from "@/utils/offline/mail-cache";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { SWRConfig } from "swr";
import { swrFetcher } from "./swr-fetcher";
import {
  getInboxZeroDesktopApp,
  shouldCheckForDesktopWebUpdate,
} from "@/utils/desktop-app";
import {
  isSafeToReload,
  reloadAtNextSafeMoment,
  runPendingReloads,
} from "@/utils/safe-reload";

const DESKTOP_WEB_UPDATE_RELOAD_GRACE_MS = 3000;
const DESKTOP_WEB_UPDATE_ACTIVATION_TIMEOUT_MS = 5000;

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
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (!serwist) return;

    const isDesktopApp = Boolean(getInboxZeroDesktopApp());
    const pageLoadedAt = Date.now();
    let hadController = Boolean(navigator.serviceWorker.controller);
    let lastCheckedAt: number | null = null;
    let registration: ServiceWorkerRegistration | undefined;
    let stopWatchingForWaiting: (() => void) | undefined;
    let refreshing = false;
    let cancelPendingUpdate: (() => void) | undefined;
    let reloadOnControllerChange = false;
    let activationTimeout: number | undefined;

    const saveOfflineMail = () => {
      saveOfflineMailPage(
        navigator.serviceWorker.controller ?? registration?.active,
      );
    };

    const reloadForUpdate = () => {
      if (refreshing) return;
      if (!isSafeToReload()) {
        cancelPendingUpdate?.();
        cancelPendingUpdate = reloadAtNextSafeMoment(reloadForUpdate);
        return;
      }
      cancelPendingUpdate?.();
      refreshing = true;
      window.location.reload();
    };

    // Wait for the new worker to control the page before reloading.
    const activateWaitingWorker = () => {
      const waiting = registration?.waiting;
      if (!waiting) return;
      reloadOnControllerChange = true;
      waiting.postMessage({ type: SKIP_WAITING });
      activationTimeout = window.setTimeout(
        reloadForUpdate,
        DESKTOP_WEB_UPDATE_ACTIVATION_TIMEOUT_MS,
      );
    };

    const handleWaitingWorker = () => {
      if (!registration?.waiting || reloadOnControllerChange) return;
      if (!navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: SKIP_WAITING });
        return;
      }
      // Browser tabs pick up the new worker on their next full load.
      if (!isDesktopApp) return;
      cancelPendingUpdate?.();
      cancelPendingUpdate = reloadAtNextSafeMoment(activateWaitingWorker);
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
        reloadOnControllerChange ||
        (hadController &&
          isDesktopApp &&
          Date.now() - pageLoadedAt >= DESKTOP_WEB_UPDATE_RELOAD_GRACE_MS)
      ) {
        window.clearTimeout(activationTimeout);
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
      cancelPendingUpdate?.();
      window.clearTimeout(activationTimeout);
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
    if (previousPathname.current !== pathname) runPendingReloads();
    previousPathname.current = pathname;
  }, [pathname]);

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
