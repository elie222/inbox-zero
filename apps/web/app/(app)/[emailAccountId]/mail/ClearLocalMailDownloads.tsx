"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { clearLocalMailDownloads } from "@/utils/email-cache/local-mail-clear-downloads";

export function ClearLocalMailDownloads({
  emailAccountId,
  generation,
  syncEnabled,
  onComplete,
}: {
  emailAccountId: string;
  generation?: string;
  syncEnabled: boolean;
  onComplete: () => void;
}) {
  const controller = useRef<AbortController | null>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);

  const clear = async () => {
    const signal = controller.current?.signal;
    if (!generation || clearing || !signal || signal.aborted) return;
    setClearing(true);
    setMessage("Removing downloaded mail… Keep this dialog open to finish.");
    try {
      while (!signal.aborted) {
        const result = await clearLocalMailDownloads({
          emailAccountId,
          generation,
        });
        if (signal.aborted) return;
        if (result.status === "cleared") {
          setMessage("Downloaded mail was removed from this device.");
          onComplete();
          return;
        }
        if (result.status === "blocked") {
          setMessage(clearBlockedMessage(result.reason));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch {
      if (!signal.aborted)
        setMessage("Clearing paused. Try again to continue safely.");
    } finally {
      if (!signal.aborted) setClearing(false);
    }
  };
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-muted-foreground text-xs">
        Turn off sync before clearing downloads. Mail stays in your email
        account. Closing this dialog pauses clearing; you can return to
        continue.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={syncEnabled || !generation || clearing}
          >
            {clearing ? "Clearing downloads…" : "Clear downloaded mail"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear this account’s downloaded mail?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove local messages and attachments from this device. Drafts,
              pending actions, and pinned conversations prevent clearing until
              you finish or unpin them. Files you saved separately remain on
              your computer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clear}>
              Clear downloads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
    </div>
  );
}

function clearBlockedMessage(reason: string) {
  switch (reason) {
    case "drafts":
      return "Finish your local drafts before clearing downloads.";
    case "queued-actions":
      return "Wait for pending mail actions to finish, then try again.";
    case "pinned-mail":
      return "Unpin conversations before clearing their downloaded mail.";
    case "active-downloads":
      return "Wait for attachment downloads to finish or cancel them, then try again.";
    case "sync-enabled":
      return "Turn off sync for this account before clearing downloads.";
    case "protected-mail":
      return "Some mail is still in use. Close open conversations and try again later.";
    case "eviction-pending":
      return "Storage cleanup is already running. Try again shortly.";
    default:
      return "Clearing paused. Try again to continue safely.";
  }
}
