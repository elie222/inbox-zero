const openComposers = new Set<symbol>();
const pendingReloads = new Set<() => void>();
let unloading = false;

// Every compose surface uses ComposeEmailFormLazy, including inline replies and drafts.
export function registerOpenComposer() {
  const composer = Symbol("composer");
  openComposers.add(composer);
  return () => {
    openComposers.delete(composer);
  };
}

export function isSafeToReload() {
  if (document.visibilityState !== "hidden" || openComposers.size) return false;
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return true;
  return !(
    element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "submit", "reset"].includes(
        element.type,
      ))
  );
}

export function reloadAtNextSafeMoment(
  reload: () => void,
  { waitForVisibilityChange = false } = {},
) {
  // A page that is still queuing work is not unloading.
  unloading = false;
  pendingReloads.add(reload);
  document.addEventListener("visibilitychange", runPendingReloads);
  document.addEventListener("focusout", onFocusOut);
  if (!waitForVisibilityChange && isSafeToReload())
    queueMicrotask(runPendingReloads);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    pendingReloads.delete(reload);
    if (!pendingReloads.size) stopListening();
  };
}

// Navigation may drain the queue only after the window is hidden. A visible
// route change is still active use and must never flash a full-page reload.
export function runPendingReloads() {
  if (unloading || !isSafeToReload()) return;
  const reloads = [...pendingReloads];
  pendingReloads.clear();
  stopListening();
  for (const reload of reloads) reload();
}

function stopListening() {
  document.removeEventListener("visibilitychange", runPendingReloads);
  document.removeEventListener("focusout", onFocusOut);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("pageshow", onPageShow);
}

// An unloading page turns hidden right after pagehide. Activating a new
// worker then would swap it under the page that is loading next.
function onPageHide() {
  unloading = true;
}

// A page restored from the back-forward cache is live again.
function onPageShow() {
  unloading = false;
}

function onFocusOut() {
  if (document.visibilityState === "hidden") queueMicrotask(runPendingReloads);
}
