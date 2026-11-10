"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const DESKTOP_MAILBOX_OPENING_TOAST_ID = "desktop-mailbox-opening";
// An up-to-date mailbox opens well within this; the first launch after an
// update can spend up to a minute migrating a large one, with mail views blank.
const SHOW_AFTER_MS = 1500;

export function DesktopMailboxOpeningToast() {
  useEffect(() => {
    const desktop = getInboxZeroDesktopApp();
    if (!desktop?.onMailEngineOpening) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = desktop.onMailEngineOpening((opening) => {
      clearTimeout(timer);
      if (!opening) {
        toast.dismiss(DESKTOP_MAILBOX_OPENING_TOAST_ID);
        return;
      }
      timer = setTimeout(() => {
        toast.loading("Updating your mailbox…", {
          id: DESKTOP_MAILBOX_OPENING_TOAST_ID,
          description: "This can take up to a minute after an app update.",
          duration: Number.POSITIVE_INFINITY,
        });
      }, SHOW_AFTER_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      toast.dismiss(DESKTOP_MAILBOX_OPENING_TOAST_ID);
    };
  }, []);

  return null;
}
