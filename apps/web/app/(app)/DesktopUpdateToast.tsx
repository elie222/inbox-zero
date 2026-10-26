"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useDesktopUpdateStatus } from "@/hooks/useDesktopUpdateStatus";

const DESKTOP_UPDATE_TOAST_ID = "desktop-app-update";

export function DesktopUpdateToast() {
  const status = useDesktopUpdateStatus();
  const current = useRef(status);
  const dismissedVersion = useRef<string | null>(null);

  useEffect(() => {
    current.current = status;
    if (status?.state !== "downloading") {
      dismissedVersion.current = null;
      toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
      return;
    }
    // Progress keeps arriving after dismissal; don't reopen the same download.
    if (dismissedVersion.current === status.version) return;
    toast(`Downloading Inbox Zero ${status.version}`, {
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
      onDismiss: () => {
        if (current.current?.state === "downloading") {
          dismissedVersion.current = current.current.version;
        }
      },
    });
  }, [status]);

  useEffect(
    () => () => {
      toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
    },
    [],
  );
  return null;
}
