"use client";

import { env } from "@/env";
import NextScript from "next/script";
import type { ComponentType } from "react";

const ExternalScript = NextScript as unknown as ComponentType<{
  src: string;
  defer: boolean;
  onError: (error: unknown) => void;
  onLoad: () => void;
}>;

export function LemonScript() {
  if (!env.NEXT_PUBLIC_LEMON_STORE_ID) return null;

  return (
    <ExternalScript
      src="/vendor/lemon/affiliate.js"
      defer
      onError={(e) => {
        console.error("Failed to load Lemon Squeezy affiliate script:", e);
      }}
      onLoad={() => {
        if (!window) return;

        // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
        (window as any).lemonSqueezyAffiliateConfig = {
          store: env.NEXT_PUBLIC_LEMON_STORE_ID,
          debug: true,
        };

        // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
        if ((window as any).createLemonSqueezyAffiliate)
          // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
          (window as any).createLemonSqueezyAffiliate();
      }}
    />
  );
}
