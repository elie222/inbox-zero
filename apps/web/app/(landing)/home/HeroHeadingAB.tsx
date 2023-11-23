"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/env.mjs";
import { useFeatureFlagVariantKey } from "posthog-js/react";

export function HeroHeadingAB() {
  const variant = useFeatureFlagVariantKey(
    "experiment-hero-heading-clean-vs-inbox-zero"
  );

  if (!variant && env.NEXT_PUBLIC_POSTHOG_KEY)
    return <Skeleton className="h-28 w-full rounded" />;

  if (variant === "clean") return <>Clean up your email, fast</>;

  return <>Reach Inbox Zero in Minutes</>;
}
