import { NEXT_ACTION_NOT_FOUND_HEADER } from "next/dist/client/components/app-router-headers";
import { toast } from "sonner";
import { isSafeToReload, reloadAtNextSafeMoment } from "./safe-reload";

const RELOADED_AT_KEY = "stale-deployment-reloaded-at";
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000;
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

export function claimStaleDeploymentReload(
  storage: Pick<Storage, "getItem" | "setItem">,
  nowMs: number,
) {
  const reloadedAt = Number(storage.getItem(RELOADED_AT_KEY));
  // A reload that still lands on the old build (for example the offline copy
  // of the page) must not turn into a reload loop.
  if (reloadedAt && nowMs - reloadedAt < RELOAD_COOLDOWN_MS) return false;
  storage.setItem(RELOADED_AT_KEY, String(nowMs));
  return true;
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

function claimAutomaticReload() {
  try {
    return claimStaleDeploymentReload(window.sessionStorage, Date.now());
  } catch {
    return false;
  }
}
