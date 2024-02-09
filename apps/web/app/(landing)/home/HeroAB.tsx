"use client";

import { useFeatureFlagVariantKey } from "posthog-js/react";
import { Skeleton } from "@/components/ui/skeleton";

const copy: {
  [key: string]: {
    title: string;
    subtitle: string;
  };
} = {
  automate: {
    title: "Automate Your Email",
    subtitle:
      "Automate your email with our AI assistant, bulk unsubscribe from newsletters, block cold emails, and view your analytics. Fully open-source.",
  },
  autopilot: {
    title: "Put Your Email on Autopilot",
    subtitle:
      "Automate your email with our AI assistant by telling it in plain English how to handle your emails. Fully open-source.",
  },
  assistant: {
    title: "Your AI assistant for email",
    subtitle:
      "Automate your email with our AI assistant, bulk unsubscribe from newsletters, block cold emails, and view your analytics. Fully open-source.",
  },
  clean: {
    title: "Clean Up Your Inbox In Minutes",
    subtitle:
      "Bulk unsubscribe from newsletters, automate your emails with AI, block cold emails, and view your analytics. Fully open-source.",
  },
  control: {
    title: "Clean Up Your Inbox In Minutes",
    subtitle:
      "Newsletter cleaner, AI automation, cold email blocker, and analytics. Inbox Zero is the open-source email app that puts you back in control of your inbox.",
  },
};

export function HeroHeadingAB(props: { variantKey: string }) {
  const variant = useFeatureFlagVariantKey(props.variantKey);

  if (!variant) return <Skeleton className="h-28 w-full rounded" />;
  if (typeof variant !== "string") return <>{copy.control.title}</>;

  return <>{copy[variant].title || copy.control.title}</>;
}

export function HeroSubtitleAB(props: { variantKey: string }) {
  const variant = useFeatureFlagVariantKey(props.variantKey);

  if (!variant) return <Skeleton className="h-24 w-full rounded" />;
  if (typeof variant !== "string") return <>{copy.control.subtitle}</>;

  return <>{copy[variant].subtitle || copy.control.subtitle}</>;
}
