"use client";

import { sendGTMEvent } from "@next/third-parties/google";
import { env } from "@/env";
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
