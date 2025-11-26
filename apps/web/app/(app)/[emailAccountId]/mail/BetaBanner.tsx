"use client";

import { useLocalStorage } from "usehooks-ts";
import { Banner } from "@/components/Banner";

export function BetaBanner() {
  const [bannerVisible, setBannerVisible] = useLocalStorage<
    boolean | undefined
  >("mailBetaBannerVisibile", true);

  if (bannerVisible && typeof window !== "undefined")
    return (
      <Banner title="Beta">
        Mail is currently in beta. It is not intended to be a full replacement
        for your email client yet.
      </Banner>
    );

  return null;
}
