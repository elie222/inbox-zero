export type DesktopAuthProvider = "apple" | "google" | "microsoft";

export type InboxZeroDesktopApi = {
  startAuth: (provider: DesktopAuthProvider) => Promise<void>;
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
