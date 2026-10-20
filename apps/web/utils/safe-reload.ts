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
  if (openComposers.size) return false;
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

export function reloadAtNextSafeMoment(reload: () => void) {
  // A page that is still queuing work is not unloading.
  unloading = false;
  pendingReloads.add(reload);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    pendingReloads.delete(reload);
    if (!pendingReloads.size) stopListening();
  };
}

// Called after client navigation, once the departing compose surface has unmounted.
export function runPendingReloads() {
  if (!isSafeToReload()) return;
  const reloads = [...pendingReloads];
  pendingReloads.clear();
  stopListening();
  for (const reload of reloads) reload();
}

function stopListening() {
  document.removeEventListener("visibilitychange", onVisibilityChange);
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

function onVisibilityChange() {
  if (document.visibilityState === "hidden" && !unloading) runPendingReloads();
}
