import { useSyncExternalStore } from "react";
import {
  type CookieConsentState,
  getCookieConsentState,
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
