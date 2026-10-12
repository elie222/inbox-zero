import { useSyncExternalStore } from "react";
import {
  type CookieConsentState,
  getCookieConsentState,
  isCookieBannerOpen,
  subscribeToCookieConsent,
} from "@/utils/cookie-consent";

/** Null during server rendering and hydration, before the device is known. */
export function useCookieConsent(): CookieConsentState | null {
  return useSyncExternalStore(
    subscribeToCookieConsent,
    getCookieConsentState,
    () => null,
  );
}

export function useCookieBannerOpen(): boolean {
  return useSyncExternalStore(
    subscribeToCookieConsent,
    isCookieBannerOpen,
    () => false,
  );
}
