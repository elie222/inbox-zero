export type DesktopAuthProvider = "apple" | "google" | "microsoft";

export const DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export type InboxZeroDesktopApi = {
  startAuth: (
    provider: DesktopAuthProvider,
    options?: { callbackPath?: string },
  ) => Promise<void>;
};

declare global {
  interface Window {
    inboxZeroDesktop?: InboxZeroDesktopApi;
  }
}

export function getInboxZeroDesktopApp(): InboxZeroDesktopApi | undefined {
  if (typeof window === "undefined") return;
  return window.inboxZeroDesktop;
}

export function shouldCheckForDesktopWebUpdate({
  isDesktopApp,
  isOnline,
  isVisible,
  lastCheckedAt,
  now,
}: {
  isDesktopApp: boolean;
  isOnline: boolean;
  isVisible: boolean;
  lastCheckedAt: number | null;
  now: number;
}): boolean {
  if (!isDesktopApp || !isOnline || !isVisible) return false;
  return (
    lastCheckedAt === null ||
    now - lastCheckedAt >= DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS
  );
}
