"use client";

import { useFeatureFlagVariantKey } from "posthog-js/react";
import { Skeleton } from "@/components/ui/skeleton";

const copy: {
  [key: string]: {
    title: string;
    subtitle: string;
  };
} = {
  control: {
    title: "Stop wasting half your day in Gmail",
    subtitle:
      "Automate your email with AI, bulk unsubscribe from newsletters, and block cold emails. Open-source.",
  },
  "clean-up-in-minutes": {
    title: "Clean Up Your Inbox In Minutes",
    subtitle:
      "Bulk unsubscribe from newsletters, automate your emails with AI, block cold emails, and view your analytics. Open-source.",
  },
  "half-the-time": {
    title: "Spend 50% less time on email",
    subtitle:
      "Automate your email with AI, bulk unsubscribe from newsletters, and block cold emails. Open-source.",
  },
  "gmail-autopilot": {
    title: "Gmail on Autopilot: Work Smarter, Not Harder",
    subtitle:
      "Let AI handle your emails, unsubscribe from newsletters, and block unwanted messages. Tools for a clutter-free inbox.",
  },
};

export function HeroHeadingAB(props: { variantKey: string }) {
  const variant = useFeatureFlagVariantKey(props.variantKey);

  if (!variant) return <Skeleton className="h-28 w-full rounded" />;
  if (typeof variant !== "string") return <>{copy.control.title}</>;

  return <>{copy[variant]?.title || copy.control.title}</>;
}

export function HeroSubtitleAB(props: { variantKey: string }) {
  const variant = useFeatureFlagVariantKey(props.variantKey);

  if (!variant) return <Skeleton className="h-24 w-full rounded" />;
  if (typeof variant !== "string") return <>{copy.control.subtitle}</>;

  return <>{copy[variant]?.subtitle || copy.control.subtitle}</>;
}
