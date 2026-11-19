const RELOADED_AT_KEY = "stale-deployment-reloaded-at";
const RELOADED_BUILD_KEY = "automatic-reload-build";
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000;

// All update paths share this guard. In-memory flags reset on navigation and
// cannot stop a stale cached document or a stalled worker from reloading again.
export function claimAutomaticReload() {
  try {
    const storage = window.sessionStorage;
    const build = process.env.NEXT_DEPLOYMENT_ID;
    if (build && storage.getItem(RELOADED_BUILD_KEY) === build) return false;
    const now = Date.now();
    const reloadedAt = Number(storage.getItem(RELOADED_AT_KEY));
    if (reloadedAt && now - reloadedAt < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOADED_AT_KEY, String(now));
    if (build) storage.setItem(RELOADED_BUILD_KEY, build);
    return true;
  } catch {
    // Without persistent storage we cannot safely recover automatically.
    return false;
  }
}
