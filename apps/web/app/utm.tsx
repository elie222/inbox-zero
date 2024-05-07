"use client";

import { useEffect } from "react";

function setUtmCookies() {
  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get("utm_source");
  const utmMedium = urlParams.get("utm_medium");
  const utmCampaign = urlParams.get("utm_campaign");
  const utmTerm = urlParams.get("utm_term");

  // expires in 30 days
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();

  if (utmSource)
    document.cookie = `utm_source=${utmSource}; expires=${expires}; path=/`;
  if (utmMedium)
    document.cookie = `utm_medium=${utmMedium}; expires=${expires}; path=/`;
  if (utmCampaign)
    document.cookie = `utm_campaign=${utmCampaign}; expires=${expires}; path=/`;
  if (utmTerm)
    document.cookie = `utm_term=${utmTerm}; expires=${expires}; path=/`;
}

export function UTM() {
  useEffect(() => {
    setUtmCookies();
  }, []);

  return null;
}
