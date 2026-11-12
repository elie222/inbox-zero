import { NEXT_ACTION_NOT_FOUND_HEADER } from "next/dist/client/components/app-router-headers";
import { toast } from "sonner";
import { isSafeToReload, reloadAtNextSafeMoment } from "./safe-reload";
import { claimAutomaticReload } from "./automatic-reload";

let cancelPendingReload: (() => void) | undefined;

// A window left open across a deploy still calls the previous build's server
// action ids, which Next.js rejects with UnrecognizedActionError. Call sites
// catch that error in many different ways, so this watches the one place every
// action call passes through: the response Next.js marks as "action not found".
export function installStaleDeploymentReload() {
  const fetchBeforeInstall = window.fetch;
  window.fetch = async (...args) => {
    const response = await fetchBeforeInstall(...args);
    if (response.headers.get(NEXT_ACTION_NOT_FOUND_HEADER) === "1") {
      handleStaleDeployment();
    }
    return response;
  };
}

function handleStaleDeployment() {
  const reload = () => {
    cancelPendingReload = undefined;
    if (!claimAutomaticReload()) return false;
    window.location.reload();
    return true;
  };
  if (isSafeToReload()) {
    cancelPendingReload?.();
    if (reload()) return;
  } else if (!cancelPendingReload)
    cancelPendingReload = reloadAtNextSafeMoment(reload);
  // Call sites handle rejected actions differently; always make the failed
  // operation visible when recovery is deferred or the loop guard blocks it.
  toast.error("Could not complete the action. Please try again.", {
    id: "stale-action-error",
  });
}
