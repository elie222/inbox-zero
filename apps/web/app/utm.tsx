"use client";

import { useEffect } from "react";

function setUtmCookies() {
  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get("utm_source");
  const utmMedium = urlParams.get("utm_medium");
  const utmCampaign = urlParams.get("utm_campaign");
  const utmTerm = urlParams.get("utm_term");
  const affiliate = urlParams.get("aff_ref");
  const referralCode = urlParams.get("ref");

  // expires in 30 days
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  const isSecureContext =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secureAttr = isSecureContext ? "; Secure" : "";

  if (utmSource)
    document.cookie = `utm_source=${encodeURIComponent(utmSource)}; expires=${expires}; path=/; SameSite=Lax${secureAttr}`;
  if (utmMedium)
    document.cookie = `utm_medium=${encodeURIComponent(utmMedium)}; expires=${expires}; path=/; SameSite=Lax${secureAttr}`;
  if (utmCampaign)
    document.cookie = `utm_campaign=${encodeURIComponent(utmCampaign)}; expires=${expires}; path=/; SameSite=Lax${secureAttr}`;
  if (utmTerm)
    document.cookie = `utm_term=${encodeURIComponent(utmTerm)}; expires=${expires}; path=/; SameSite=Lax${secureAttr}`;
  if (affiliate)
    document.cookie = `affiliate=${encodeURIComponent(affiliate)}; expires=${expires}; path=/; SameSite=Lax${secureAttr}`;
  if (referralCode)
    document.cookie = `referral_code=${encodeURIComponent(referralCode)}; expires=${expires}; path=/; SameSite=Lax${secureAttr}`;
}

export function UTM() {
  useEffect(() => {
    setUtmCookies();
  }, []);

  return null;
}
