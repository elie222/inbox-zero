import posthog from "posthog-js";
import { MAIL_ANALYTICS_EVENTS } from "@/utils/analytics/product";

// A remount this soon after the composer vanished is the same draft coming
// back. One that stays gone is not reported: Escape, leaving mail or switching
// accounts also close a focused composer, and none of them is a glitch.
const REMOUNT_WINDOW_MS = 10_000;

const pending = new Map<
  string,
  { unmountedAt: number; timeout: ReturnType<typeof setTimeout> }
>();

/**
 * The composer unmounted while it had focus, and nothing closed it: not send,
 * discard, close, or pop out. Reported if the same draft comes back.
 */
export function trackComposerUnmountedWhileFocused(composer: {
  emailAccountId: string;
  draftSessionId?: string;
}) {
  const key = composerKey(composer);
  clearTimeout(pending.get(key)?.timeout);
  pending.set(key, {
    unmountedAt: performance.now(),
    timeout: setTimeout(() => pending.delete(key), REMOUNT_WINDOW_MS),
  });
}

export function trackComposerMounted({
  draftMode,
  ...composer
}: {
  emailAccountId: string;
  draftSessionId?: string;
  draftMode?: string;
}) {
  const key = composerKey(composer);
  const lost = pending.get(key);
  if (!lost) return;
  clearTimeout(lost.timeout);
  pending.delete(key);
  capture({
    draftMode,
    trigger: "remount",
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
  trigger: "remount" | "keypress";
  remount_ms?: number;
}) {
  posthog.capture(MAIL_ANALYTICS_EVENTS.composerLost, {
    draft_mode: draftMode ?? "new",
    ...properties,
  });
}

// New messages share one session id in every account.
function composerKey({
  emailAccountId,
  draftSessionId,
}: {
  emailAccountId: string;
  draftSessionId?: string;
}) {
  return `${emailAccountId}:${draftSessionId ?? "new"}`;
}
