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

function setUtmCookies({ includeTracking }: { includeTracking: boolean }) {
  const urlParams = new URLSearchParams(window.location.search);

  // expires in 30 days
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();

  for (const { param, cookie } of ATTRIBUTION_PARAMS) {
    // Referral codes credit the referring user, so they don't need consent.
    if (!includeTracking && cookie !== "referral_code") continue;

    const value = urlParams.get(param);
    if (!value || hasCookie(cookie)) continue;

    document.cookie = `${cookie}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
  }
}

function hasCookie(name: string) {
  return document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${name}=`));
}

export function UTM() {
  const consent = useCookieConsent();

  useEffect(() => {
    if (!consent) return;

    setUtmCookies({
      includeTracking: consent === "not-required" || consent === "granted",
    });
  }, [consent]);

  return null;
}
