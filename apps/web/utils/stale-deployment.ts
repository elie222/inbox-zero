import { NEXT_ACTION_NOT_FOUND_HEADER } from "next/dist/client/components/app-router-headers";
import { toast } from "sonner";

const RELOADED_AT_KEY = "stale-deployment-reloaded-at";
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000;
const TOAST_ID = "stale-deployment";

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
  // Drafts save on a short debounce, so reloading mid-keystroke could drop the
  // last few characters. When typing, or when the loop guard or storage rules
  // out an automatic reload, let the user pick the moment instead.
  if (!isEditingText() && claimAutomaticReload()) {
    window.location.reload();
    return;
  }
  toast.info("Inbox Zero was updated", {
    id: TOAST_ID,
    description: "Reload to keep using the latest version.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Reload",
      onClick: () => window.location.reload(),
    },
  });
}

function claimAutomaticReload() {
  try {
    return claimStaleDeploymentReload(window.sessionStorage, Date.now());
  } catch {
    return false;
  }
}

function isEditingText() {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return false;
  return (
    element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "submit", "reset"].includes(
        element.type,
      ))
  );
}
