"use client";

import Script from "next/script";
import { env } from "@/env.mjs";

export function LemonScript() {
  if (!env.NEXT_PUBLIC_LEMON_STORE_ID) return null;

  return (
    <Script
      src="https://lmsqueezy.com/affiliate.js"
      defer
      strategy="lazyOnload"
      onLoad={() => {
        if (window) {
          (window as any).lemonSqueezyAffiliateConfig = {
            store: env.NEXT_PUBLIC_LEMON_STORE_ID,
          };
        }
      }}
    />
  );
}
