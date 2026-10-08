"use client";

import { useEffect } from "react";
import { useCookieConsent } from "@/hooks/useCookieConsent";

const ATTRIBUTION_PARAMS = [
  { param: "utm_source", cookie: "utm_source" },
  { param: "utm_medium", cookie: "utm_medium" },
  { param: "utm_campaign", cookie: "utm_campaign" },
  { param: "utm_term", cookie: "utm_term" },
  { param: "aff_ref", cookie: "affiliate" },
  { param: "ref", cookie: "referral_code" },
  { param: "gclid", cookie: "gclid" },
  { param: "gbraid", cookie: "gbraid" },
  { param: "wbraid", cookie: "wbraid" },
  { param: "gad_campaignid", cookie: "gad_campaignid" },
  { param: "gad_source", cookie: "gad_source" },
] as const;

export function UTM() {
  const consent = useCookieConsent();

  useEffect(() => {
    captureLandingParams();
    if (!consent) return;

    const canTrack = consent === "not-required" || consent === "granted";
    if (!canTrack) clearTrackingAttributionCookies();
    setAttributionCookies({ includeTracking: canTrack });
  }, [consent]);

  return null;
}

// Consent can arrive after the visitor has navigated away from the landing
// URL, so its campaign parameters are kept for when it does.
let landingSearch: string | null = null;

function captureLandingParams() {
  landingSearch ??= window.location.search;
}

function setAttributionCookies({
  includeTracking,
}: {
  includeTracking: boolean;
}) {
  const urlParams = new URLSearchParams(landingSearch ?? "");

  // expires in 30 days
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();

  for (const { param, cookie } of ATTRIBUTION_PARAMS) {
    if (!includeTracking && !isReferralCookie(cookie)) continue;

    const value = urlParams.get(param);
    if (!value || hasCookie(cookie)) continue;

    document.cookie = `${cookie}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
  }
}

function clearTrackingAttributionCookies() {
  for (const { cookie } of ATTRIBUTION_PARAMS) {
    if (isReferralCookie(cookie) || !hasCookie(cookie)) continue;

    document.cookie = `${cookie}=; Max-Age=0; path=/`;
  }
}

// Referral codes credit the referring user, so they don't need consent.
function isReferralCookie(cookie: string) {
  return cookie === "referral_code";
}

function hasCookie(name: string) {
  return document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${name}=`));
}
