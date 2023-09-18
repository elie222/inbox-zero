"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureFlagVariantKey } from "posthog-js/react";

export function HeroHeadingAB() {
  const variant = useFeatureFlagVariantKey("experiment-hero-heading");

  if (variant === "control") return <>Reach Inbox Zero in Minutes</>;
  if (variant === "test") return <>The Quickest Way to Inbox Zero</>;

  return <Skeleton className="h-28 w-full rounded" />;
}
