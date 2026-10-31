import posthog from "posthog-js";
import { MAIL_ANALYTICS_EVENTS } from "@/utils/analytics/product";

// A remount this soon after the composer vanished is the same draft coming back.
const REMOUNT_WINDOW_MS = 10_000;

const pending = new Map<
  string,
  {
    unmountedAt: number;
    draftMode?: string;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

/**
 * The composer unmounted while it had focus, and nothing closed it: not send,
 * discard, close, or pop out. Reported once it comes back or the window ends.
 */
export function trackComposerUnmountedWhileFocused({
  draftSessionId,
  draftMode,
}: {
  draftSessionId?: string;
  draftMode?: string;
}) {
  const key = draftSessionId ?? "new";
  clearTimeout(pending.get(key)?.timeout);
  const unmountedAt = performance.now();
  pending.set(key, {
    unmountedAt,
    draftMode,
    timeout: setTimeout(() => {
      pending.delete(key);
      capture({ draftMode, trigger: "unmount", remounted: false });
    }, REMOUNT_WINDOW_MS),
  });
}

export function trackComposerMounted(draftSessionId?: string) {
  const key = draftSessionId ?? "new";
  const lost = pending.get(key);
  if (!lost) return;
  clearTimeout(lost.timeout);
  pending.delete(key);
  capture({
    draftMode: lost.draftMode,
    trigger: "unmount",
    remounted: true,
    remount_ms: Math.round(performance.now() - lost.unmountedAt),
  });
}

/**
 * The composer stayed but its focused editor was removed, and a key was then
 * pressed with nothing focused, so it reached the page's shortcuts.
 */
export function trackKeyAfterEditorRemoved(draftMode?: string) {
  capture({ draftMode, trigger: "keypress" });
}

function capture({
  draftMode,
  ...properties
}: {
  draftMode?: string;
  trigger: "unmount" | "keypress";
  remounted?: boolean;
  remount_ms?: number;
}) {
  posthog.capture(MAIL_ANALYTICS_EVENTS.composerLost, {
    draft_mode: draftMode ?? "new",
    ...properties,
  });
}
