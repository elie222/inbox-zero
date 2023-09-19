"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureFlagVariantKey } from "posthog-js/react";

export function HeroHeadingAB() {
  const variant = useFeatureFlagVariantKey("experiment-hero-heading");

  if (!variant) return <Skeleton className="h-28 w-full rounded" />;

  if (variant === "quickest") return <>The Quickest Way to Inbox Zero</>;
  if (variant === "get") return <>Get to Inbox Zero Fast</>;
  if (variant === "assistant") return <>Your Personal Assistant for Email</>;

  return <>Reach Inbox Zero in Minutes</>;
}
