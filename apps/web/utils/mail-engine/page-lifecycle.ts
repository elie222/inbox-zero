export function bindMailEnginePageLifecycle(
  page: EventTarget,
  abort: AbortController,
  restore: () => void,
) {
  const onHide = () => abort.abort();
  const onShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) restore();
  };
  // React cleanup does not run when a document enters the back/forward cache.
  page.addEventListener("pagehide", onHide);
  page.addEventListener("pageshow", onShow);
  return () => {
    page.removeEventListener("pagehide", onHide);
    page.removeEventListener("pageshow", onShow);
  };
}
