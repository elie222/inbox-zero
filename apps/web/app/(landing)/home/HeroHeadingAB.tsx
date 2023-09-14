"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureFlagVariantKey } from "posthog-js/react";

export function HeroHeadingAB() {
  const variant = useFeatureFlagVariantKey("experiment-hero-heading");

  if (variant === "control")
    return <>Automate your emails with the power of AI</>;
  // if (variant === "test") return <>Automate your email support with AI</>;
  if (variant === "test")
    return <>Open source tools to reach inbox zero fast</>;

  // return <div className="h-28"></div>;
  return <Skeleton className="h-28 w-full rounded" />;
}
