"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureFlagVariantKey } from "posthog-js/react";

export function HeroHeadingAB() {
  const variant = useFeatureFlagVariantKey("experiment-hero-heading");

  if (variant === "control") return <>Reach inbox zero in minutes</>;
  if (variant === "test") return <>The quickest way to inbox zero</>;

  return <Skeleton className="h-28 w-full rounded" />;
}
