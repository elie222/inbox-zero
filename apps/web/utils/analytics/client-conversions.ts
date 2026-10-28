"use client";

import { sendGTMEvent } from "@next/third-parties/google";
import { env } from "@/env";
import {
  canUseTrackingCookies,
  getCookieConsentState,
  subscribeToCookieConsent,
} from "@/utils/cookie-consent";
import {
  CONVERSION_BROWSER_EVENT,
  type ConversionEvent,
} from "@/utils/analytics/conversion-events";

declare global {
  interface Window {
    inboxZeroConversionQueue?: ConversionEvent[];
  }
}

export function trackClientConversion(event: ConversionEvent) {
  if (typeof window === "undefined") return;

  const consent = getCookieConsentState();
  if (consent === "denied") return;
  if (consent === "pending") {
    holdUntilConsentDecided(event);
    return;
  }

  sendConversion(event);
}

// Conversions often happen before a visitor answers the banner, such as right
// after checkout, so they wait in memory for the decision.
let heldConversions: ConversionEvent[] = [];

function holdUntilConsentDecided(event: ConversionEvent) {
  heldConversions.push(event);
  if (heldConversions.length > 1) return;

  const unsubscribe = subscribeToCookieConsent(() => {
    if (getCookieConsentState() === "pending") return;

    unsubscribe();
    const conversions = heldConversions;
    heldConversions = [];
    if (!canUseTrackingCookies()) return;

    for (const conversion of conversions) sendConversion(conversion);
  });
}

function sendConversion(event: ConversionEvent) {
  trackGoogleTagManagerConversion(event);
  trackPrivateConversion(event);
}

function trackGoogleTagManagerConversion(event: ConversionEvent) {
  if (!env.NEXT_PUBLIC_GTM_ID) return;

  if (event.name === "registration_completed") {
    sendGTMEvent({ event: "CompleteRegistration" });
  }
}

function trackPrivateConversion(event: ConversionEvent) {
  if (!env.NEXT_PUBLIC_CONVERSION_ANALYTICS_SCRIPT_URL) return;

  window.inboxZeroConversionQueue ??= [];
  window.inboxZeroConversionQueue.push(event);
  window.dispatchEvent(
    new CustomEvent(CONVERSION_BROWSER_EVENT, { detail: event }),
  );
}
