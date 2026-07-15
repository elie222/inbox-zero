"use client";

import { useIsClient, useLocalStorage } from "usehooks-ts";
import { Banner } from "@/components/Banner";

export function BetaBanner() {
  const isClient = useIsClient();
  const [bannerVisible] = useLocalStorage<boolean | undefined>(
    "mailBetaBannerVisibile",
    true,
  );

  if (isClient && bannerVisible)
    return (
      <Banner title="Beta">
        Mail is currently in beta. It is not intended to be a full replacement
        for your email client yet.
      </Banner>
    );

  return null;
}
