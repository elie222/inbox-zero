import { Suspense } from "react";
import {
  ConversionAnalyticsScript,
  ConversionQueryParamEvents,
} from "@/components/ConversionAnalytics";
import { LemonScript } from "@/utils/scripts/lemon";
import { PostHogInit, PostHogPageview } from "@/providers/PostHogProvider";
import { getMarketingPostHogBootstrap } from "@/utils/marketing/flags";

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const postHogBootstrap = await getMarketingPostHogBootstrap();

  return (
    <>
      <PostHogInit bootstrap={postHogBootstrap} />
      <Suspense>
        <PostHogPageview />
      </Suspense>
      {children}
      <Suspense>
        <ConversionQueryParamEvents />
      </Suspense>
      <ConversionAnalyticsScript />
      <LemonScript />
    </>
  );
}
