export type DesktopAuthProvider = "apple" | "google" | "microsoft";

export const DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export const DESKTOP_WEB_UPDATE_PROMPT_COOLDOWN_MS = 60 * 60 * 1000;
export const DESKTOP_WEB_UPDATE_LAST_PROMPTED_KEY =
  "inbox-zero:desktop-web-update-last-prompted-at";

export type InboxZeroDesktopApi = {
  setUnreadCount?: (count: number) => void;
  notifyNewMail?: (payload: {
    emailAccountId: string;
    messages: { id: string; receivedAt: number }[];
  }) => void;
  openWindow?: (path: string) => Promise<void>;
  startAuth: (
    provider: DesktopAuthProvider,
    options?: { callbackPath?: string },
  ) => Promise<void>;
  mailEngine?: (payload: unknown) => Promise<unknown>;
  wipeMailbox?: () => Promise<unknown>;
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
    now < lastCheckedAt ||
    now - lastCheckedAt >= DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS
  );
}

export function shouldPromptDesktopWebUpdate({
  isDesktopApp,
  hasController,
  hasWaitingWorker,
  lastPromptedAt,
  now,
}: {
  isDesktopApp: boolean;
  hasController: boolean;
  hasWaitingWorker: boolean;
  lastPromptedAt: number | null;
  now: number;
}): boolean {
  if (!isDesktopApp || !hasController || !hasWaitingWorker) return false;
  return (
    lastPromptedAt === null ||
    now < lastPromptedAt ||
    now - lastPromptedAt >= DESKTOP_WEB_UPDATE_PROMPT_COOLDOWN_MS
  );
}
