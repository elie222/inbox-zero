"use client";

import { env } from "@/env";
import Script from "next/script";

export function LemonScript() {
  if (!env.NEXT_PUBLIC_LEMON_STORE_ID) return null;

  return (
    <Script
      src="/vendor/lemon/affiliate.js"
      defer
      onError={(e) => {
        console.error("Failed to load Lemon Squeezy affiliate script:", e);
      }}
      onLoad={() => {
        if (!window) return;

        (window as any).lemonSqueezyAffiliateConfig = {
          store: env.NEXT_PUBLIC_LEMON_STORE_ID,
          debug: true,
        };

        if ((window as any).createLemonSqueezyAffiliate)
          (window as any).createLemonSqueezyAffiliate();
      }}
    />
  );
}
