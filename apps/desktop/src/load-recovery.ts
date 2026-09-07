import type { WebContents } from "electron";

export function installDesktopLoadRecovery(
  contents: WebContents,
  appOrigin: string,
  getStartUrl: () => string,
) {
  let targetUrl = getStartUrl();
  let showingRecovery = false;
  let loadingRecoveryPage = false;
  let loadTimeout: ReturnType<typeof setTimeout> | undefined;
  let retryTimeout: ReturnType<typeof setTimeout> | undefined;

  function cancelTimers() {
    clearTimeout(loadTimeout);
    clearTimeout(retryTimeout);
    loadTimeout = undefined;
    retryTimeout = undefined;
  }

  function showRecovery() {
    if (contents.isDestroyed()) return;
    cancelTimers();
    showingRecovery = true;
    loadingRecoveryPage = true;
    contents.loadURL(getDesktopRecoveryPage(targetUrl)).catch(() => {});
    retryTimeout = setTimeout(() => {
      if (!contents.isDestroyed()) contents.loadURL(targetUrl).catch(() => {});
    }, 10_000);
  }

  contents.on(
    "did-start-navigation",
    ({ url, isSameDocument, isMainFrame }) => {
      if (!isMainFrame || isSameDocument || !isAppUrl(url, appOrigin)) return;
      targetUrl = url;
      cancelTimers();
      loadTimeout = setTimeout(() => {
        contents.stop();
        showRecovery();
      }, 15_000);
    },
  );
  contents.on(
    "did-fail-load",
    (_event, code, _description, url, isMainFrame) => {
      // Chromium aborts superseded navigations; images and iframes must never
      // replace an otherwise usable inbox with the recovery screen.
      if (!isMainFrame || code === -3 || !isAppUrl(url, appOrigin)) return;
      targetUrl = url;
      showRecovery();
    },
  );
  contents.on("did-finish-load", () => {
    // Chromium also finishes its error document after did-fail-load.
    if (loadTimeout === undefined || !isAppUrl(contents.getURL(), appOrigin))
      return;
    showingRecovery = false;
    cancelTimers();
  });
  contents.on("render-process-gone", showRecovery);
  contents.once("destroyed", cancelTimers);

  // Reloading the local recovery page from View > Reload should retry the app.
  contents.on("did-start-navigation", ({ url, isMainFrame }) => {
    if (!showingRecovery || !isMainFrame || !url.startsWith("data:text/html"))
      return;
    if (loadingRecoveryPage) {
      loadingRecoveryPage = false;
      return;
    }
    cancelTimers();
    retryTimeout = setTimeout(() => {
      if (!contents.isDestroyed()) contents.loadURL(targetUrl).catch(() => {});
    }, 0);
  });
}

export function getDesktopRecoveryPage(targetUrl: string) {
  const href = targetUrl
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Inbox Zero</title><style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fafafa; color: #18181b; font: 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
main { max-width: 420px; padding: 40px; text-align: center; }
h1 { font-size: 24px; letter-spacing: -.5px; } p { color: #52525b; line-height: 1.6; }
a { display: inline-block; margin: 16px 0; padding: 12px 24px; background: #18181b; color: white; border-radius: 8px; text-decoration: none; }
small { display: block; color: #71717a; }
</style></head><body><main><h1>Connecting to Inbox Zero</h1>
<p>We couldn't load your mailbox. Check your connection. We'll retry automatically.</p>
<a href="${href}">Retry now</a><small>You can also use View → Reload.</small>
</main></body></html>`)}`;
}

function isAppUrl(url: string, origin: string) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}
