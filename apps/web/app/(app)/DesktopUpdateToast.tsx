"use client";

import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useDesktopUpdateStatus } from "@/hooks/useDesktopUpdateStatus";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const DESKTOP_UPDATE_TOAST_ID = "desktop-app-update";
const ANNOUNCED_VERSION_KEY = "desktop-update-announced-version";

export function DesktopUpdateToast() {
  const { t } = useLingui();
  const status = useDesktopUpdateStatus();
  const isVisible = useSyncExternalStore(
    subscribeToVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
  const current = useRef(status);
  const dismissedVersion = useRef<string | null>(null);
  const shownReadyVersion = useRef<string | null>(null);

  useEffect(() => {
    current.current = status;

    if (status?.state === "ready") {
      dismissedVersion.current = null;
      // Ready status replays on every page load and window, so announcing it
      // each time nagged people. Announce each release once; the sidebar item
      // stays as the persistent way to restart. Desktop tabs share storage, so
      // only a visible renderer may claim the announcement.
      if (!isVisible) return;
      if (shownReadyVersion.current === status.version) return;
      if (getAnnouncedVersion() === status.version) {
        toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
        return;
      }
      setAnnouncedVersion(status.version);
      shownReadyVersion.current = status.version;
      toast(t`Inbox Zero ${status.version} is ready`, {
        id: DESKTOP_UPDATE_TOAST_ID,
        description: t`Restart the app to finish updating.`,
        duration: Number.POSITIVE_INFINITY,
        onDismiss: undefined,
        action: {
          label: t`Restart`,
          onClick: () => {
            getInboxZeroDesktopApp()?.installUpdate?.();
          },
        },
      });
      return;
    }

    if (status?.state !== "downloading") {
      dismissedVersion.current = null;
      toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
      return;
    }
    // Progress keeps arriving after dismissal; don't reopen the same download.
    if (dismissedVersion.current === status.version) return;
    toast(t`Downloading Inbox Zero ${status.version}`, {
      id: DESKTOP_UPDATE_TOAST_ID,
      description: (
        <div className="mt-2 flex items-center gap-2">
          <Progress value={status.percent} className="h-1.5" />
          <span className="w-9 text-right text-xs tabular-nums">
            {status.percent}%
          </span>
        </div>
      ),
      duration: Number.POSITIVE_INFINITY,
      action: undefined,
      onDismiss: () => {
        if (current.current?.state === "downloading") {
          dismissedVersion.current = current.current.version;
        }
      },
    });
  }, [status, isVisible, t]);

  useEffect(
    () => () => {
      toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
    },
    [],
  );
  return null;
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getAnnouncedVersion() {
  try {
    return window.localStorage.getItem(ANNOUNCED_VERSION_KEY);
  } catch {
    return null;
  }
}

function setAnnouncedVersion(version: string) {
  try {
    window.localStorage.setItem(ANNOUNCED_VERSION_KEY, version);
  } catch {}
}
