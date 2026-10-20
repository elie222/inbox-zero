const openComposers = new Set<symbol>();
const pendingReloads = new Set<() => void>();

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
  pendingReloads.add(reload);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    pendingReloads.delete(reload);
    if (!pendingReloads.size)
      document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

// Called after client navigation, once the departing compose surface has unmounted.
export function runPendingReloads() {
  if (!isSafeToReload()) return;
  const reloads = [...pendingReloads];
  pendingReloads.clear();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  for (const reload of reloads) reload();
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") runPendingReloads();
}
