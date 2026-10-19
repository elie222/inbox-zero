"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const DESKTOP_UPDATE_TOAST_ID = "desktop-app-update";

export function DesktopUpdateToast() {
  useEffect(() => {
    const desktop = getInboxZeroDesktopApp();
    if (!desktop?.onUpdateStatus) return;

    // Progress keeps arriving after someone closes the toast; don't reopen it
    // until the download finishes.
    let dismissedVersion: string | null = null;

    const unsubscribe = desktop.onUpdateStatus((status) => {
      if (!status) {
        toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
        return;
      }

      if (status.state === "downloading") {
        if (dismissedVersion === status.version) return;
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
            dismissedVersion = status.version;
          },
        });
        return;
      }

      toast("Update ready", {
        id: DESKTOP_UPDATE_TOAST_ID,
        description: `Restart Inbox Zero to finish updating to ${status.version}.`,
        duration: Number.POSITIVE_INFINITY,
        onDismiss: undefined,
        action: {
          label: "Restart",
          onClick: () => {
            desktop.installUpdate?.();
          },
        },
      });
    });

    return () => {
      unsubscribe();
      toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
    };
  }, []);

  return null;
}
